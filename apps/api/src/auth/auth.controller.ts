import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { parseCookie } from 'cookie';
import type { Request, Response } from 'express';

import {
  ApiEnvelope,
  ApiErrorEnvelope,
} from '../common/decorators/api-envelope.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthRequest } from '../common/interfaces/auth-request.interface';
import { EnvironmentService } from '../config/environment.service';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './constants/auth.constants';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import {
  AuthMessageDto,
  AuthResponseDto,
  AuthUserDto,
} from './dto/auth-response.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Authentication')
@ApiErrorEnvelope(400, 'Invalid request data')
@ApiErrorEnvelope(401, 'Missing, invalid, expired or revoked credentials')
@ApiErrorEnvelope(403, 'Insufficient permissions or untrusted request origin')
@ApiErrorEnvelope(429, 'Rate limit exceeded; retry after the indicated delay')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly environment: EnvironmentService,
  ) {}

  private cookieOptions(path: string) {
    return {
      httpOnly: true,
      secure: this.environment.isProduction,
      sameSite: 'strict' as const,
      path,
    };
  }
  private sendTokens(
    response: Response,
    result: Awaited<ReturnType<AuthService['login']>>,
  ) {
    response.cookie(ACCESS_COOKIE, result.accessToken, {
      ...this.cookieOptions('/'),
      maxAge: result.expiresIn * 1000,
    });
    response.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieOptions('/auth'),
      expires: result.refreshExpiresAt,
    });
    return {
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @ApiCookieAuth('accessCookie')
  @ApiOperation({
    summary: 'Invite a user (ADMIN only)',
    description:
      'Creates an INVITED user and queues an email. Success does not guarantee email delivery.',
  })
  @ApiEnvelope(AuthUserDto, 201)
  @ApiErrorEnvelope(409, 'Email already exists')
  @Post('invitations')
  invite(@Req() request: AuthRequest, @Body() data: InviteUserDto) {
    return this.auth.invite(request.auth, data);
  }

  @ApiCookieAuth('accessCookie')
  @ApiOperation({
    summary: 'Resend invitation (ADMIN only)',
    description:
      'Revokes the previous invitation token and queues a new email.',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiEnvelope(AuthUserDto)
  @ApiErrorEnvelope(404, 'User not found')
  @ApiErrorEnvelope(409, 'User is not invited')
  @Post('invitations/:userId/resend')
  @HttpCode(200)
  resend(
    @Req() request: AuthRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.auth.resend(request.auth, userId);
  }

  @Public()
  @ApiOperation({
    summary: 'Accept invitation and set password',
    description:
      'Activates the account. Does not sign in. Rate limit: 5 requests per minute.',
  })
  @ApiEnvelope(AuthMessageDto)
  @Post('invitations/accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  accept(@Body() data: AcceptInvitationDto) {
    return this.auth.acceptInvitation(data.token, data.password);
  }

  @Public()
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Sets access_token and refresh_token HttpOnly cookies. No tokens in JSON. Rate limit: 5 requests per minute.',
  })
  @ApiEnvelope(AuthResponseDto)
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() data: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.sendTokens(
      response,
      await this.auth.login(data.email, data.password),
    );
  }

  @Public()
  @ApiCookieAuth('refreshCookie')
  @ApiOperation({
    summary: 'Rotate refresh token',
    description:
      'Sets both cookies again. Previous refresh token becomes invalid; session expiry is fixed.',
  })
  @ApiEnvelope(AuthResponseDto)
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken =
      parseCookie(request.headers.cookie ?? '')[REFRESH_COOKIE] ?? '';
    return this.sendTokens(response, await this.auth.refresh(rawToken));
  }

  @Public()
  @ApiCookieAuth('refreshCookie')
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the current session and clears both cookies. Works without a valid access cookie; repeated logout succeeds.',
  })
  @ApiEnvelope(AuthMessageDto)
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token =
      parseCookie(request.headers.cookie ?? '')[REFRESH_COOKIE] ?? '';
    const result = await this.auth.logout(token);
    response.clearCookie(ACCESS_COOKIE, this.cookieOptions('/'));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions('/auth'));
    return result;
  }

  @ApiCookieAuth('accessCookie')
  @ApiOperation({ summary: 'Get current user' })
  @ApiEnvelope(AuthUserDto)
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: AuthRequest) {
    return request.auth.user;
  }

  @ApiCookieAuth('accessCookie')
  @ApiOperation({
    summary: 'Block user and revoke sessions and invitations (ADMIN only)',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiEnvelope(AuthMessageDto)
  @ApiErrorEnvelope(404, 'User not found')
  @Post('users/:userId/block')
  @HttpCode(200)
  block(
    @Req() request: AuthRequest,
    @Param('userId', new ParseUUIDPipe()) id: string,
  ) {
    return this.auth.setBlocked(request.auth, id, true);
  }

  @ApiCookieAuth('accessCookie')
  @ApiOperation({
    summary: 'Unblock user; old sessions remain revoked (ADMIN only)',
  })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiEnvelope(AuthMessageDto)
  @ApiErrorEnvelope(404, 'User not found')
  @ApiErrorEnvelope(409, 'User is not blocked')
  @Post('users/:userId/unblock')
  @HttpCode(200)
  unblock(
    @Req() request: AuthRequest,
    @Param('userId', new ParseUUIDPipe()) id: string,
  ) {
    return this.auth.setBlocked(request.auth, id, false);
  }
}

// Sliding window and block updates are one atomic Redis operation. Redis time
// avoids clock skew between API replicas. At most `limit` events are retained.
export const RATE_LIMIT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local eventId = ARGV[4]
local blockTtl = redis.call('PTTL', blockKey)

if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', blockKey))
  return {hits, math.ceil(blockTtl / 1000), 1, math.ceil(blockTtl / 1000)}
end

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', hitsKey, '-inf', now - ttl)
local hits = redis.call('ZCARD', hitsKey)
local oldest = redis.call('ZRANGE', hitsKey, 0, 0, 'WITHSCORES')
local remaining = ttl
if #oldest > 0 then
  remaining = tonumber(oldest[2]) + ttl - now
end
local resetSeconds = math.ceil(remaining / 1000)

if hits >= limit then
  if blockDuration > 0 then
    redis.call('SET', blockKey, hits + 1, 'PX', blockDuration)
    redis.call('DEL', hitsKey)
    return {hits + 1, resetSeconds, 1, math.ceil(blockDuration / 1000)}
  end
  return {hits + 1, resetSeconds, 1, resetSeconds}
end

redis.call('ZADD', hitsKey, now, eventId)
redis.call('PEXPIRE', hitsKey, ttl)
return {hits + 1, resetSeconds, 0, 0}
`;

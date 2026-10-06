const apiUrl = import.meta.env.VITE_API_URL;

if (typeof apiUrl !== 'string' || apiUrl.trim() === '') {
  throw new Error('VITE_API_URL is required');
}

export const env = {
  apiUrl: apiUrl.trim(),
};

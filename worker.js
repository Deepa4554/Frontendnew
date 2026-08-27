export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/hubs/')) {
      const backendUrl = 'https://cafeposapi-et7f.onrender.com' + url.pathname + url.search;
      return fetch(new Request(backendUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};

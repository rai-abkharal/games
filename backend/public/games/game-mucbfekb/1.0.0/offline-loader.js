// Packaging adapter only; original/game.js is preserved without changes.
(() => {
  const packed = JSON.parse(document.getElementById('offline-files').textContent);
  const urls = new Map();
  for (const [name, [type, base64]] of Object.entries(packed)) {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    urls.set(name, URL.createObjectURL(new Blob([bytes], { type })));
  }
  function resolve(value) {
    const path = String(value).replace(/^\.\//, '').split(/[?#]/)[0];
    return urls.get(path) || value;
  }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => nativeFetch(typeof input === 'string' ? resolve(input) : input, init);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...descriptor, set(value) { descriptor.set.call(this, resolve(value)); }
  });
  document.getElementById('offline-files').remove();
})();

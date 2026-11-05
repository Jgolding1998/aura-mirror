// A classic worker keeps importScripts available to the MediaPipe WASM loader.
self.onmessage = async event => {
  try {
    await import(event.data.moduleUrl);
    self.onmessage(event);
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) });
  }
};

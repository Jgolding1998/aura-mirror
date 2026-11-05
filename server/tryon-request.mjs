import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// fetch has a five-minute response-header timeout. A CPU render can exceed it.
export function requestCpuTryOn(url, { headers, body, signal }) {
  const endpoint = new URL(url);
  const request = endpoint.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = request(endpoint, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      signal,
    }, incoming => {
      const chunks = [];
      let bytes = 0;
      incoming.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 18 * 1024 * 1024) {
          incoming.destroy(new Error('Try-on response exceeds the image size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on('error', reject);
      incoming.on('end', () => {
        const status = incoming.statusCode;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          json: () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
      });
    });
    outgoing.on('error', error => reject(signal.aborted ? signal.reason : error));
    outgoing.end(body);
  });
}

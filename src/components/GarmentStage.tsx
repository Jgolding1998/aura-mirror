import { useEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { ImageOff } from 'lucide-react';
import type { ClosetItem, OverlaySettings } from '../types';

interface Props {
  item: ClosetItem | null;
  live: boolean;
  settings: OverlaySettings;
  anchorRef: RefObject<HTMLDivElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
}

/**
 * The centred garment. With the camera off it stands as a hologram on a light
 * plinth; with the camera on it is the flat Live overlay. Neither is a fitted render.
 */
export function GarmentStage({ item, live, settings, anchorRef, imageRef }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => setFailedUrl(null), [item?.imageUrl]);

  if (!item || !settings.visible) return null;

  const style = {
    '--overlay-opacity': settings.opacity,
    '--overlay-scale': settings.scale,
    '--overlay-x': `${settings.offsetX}vw`,
    '--overlay-y': `${settings.offsetY}vh`,
  } as CSSProperties;

  return (
    <div
      ref={anchorRef}
      className={`garment ${live ? 'garment--live' : 'garment--holo'}`}
      style={style}
      data-testid="garment-overlay"
      data-item-id={item.id}
    >
      {!live && (
        <div className="garment__plinth" aria-hidden="true">
          <span className="garment__beam" />
          <span className="garment__ring" />
          <span className="garment__ring garment__ring--inner" />
        </div>
      )}
      {failedUrl === item.imageUrl ? (
        <div className="garment__missing" role="img" aria-label={`Image for ${item.name} could not be loaded`}>
          <ImageOff aria-hidden="true" />
          <span>Image unavailable</span>
        </div>
      ) : (
        <img
          ref={imageRef}
          key={item.id}
          className="garment__image"
          src={item.imageUrl}
          alt={`${item.name}, shown as ${live ? 'a Live overlay on the camera' : 'a preview'}`}
          draggable={false}
          onError={() => setFailedUrl(item.imageUrl)}
        />
      )}
    </div>
  );
}

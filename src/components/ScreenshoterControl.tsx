import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { SimpleMapScreenshoter } from 'leaflet-simple-map-screenshoter';

export default function ScreenshoterControl() {
  const map = useMap();

  useEffect(() => {
    const screenshoter = new SimpleMapScreenshoter({
        hidden: true,
        preventDownload: false,
    }).addTo(map);
    
    // Add it to window so we can trigger it from outside
    (window as any).mapScreenshoter = screenshoter;

    return () => {
      screenshoter.remove();
      delete (window as any).mapScreenshoter;
    };
  }, [map]);

  return null;
}

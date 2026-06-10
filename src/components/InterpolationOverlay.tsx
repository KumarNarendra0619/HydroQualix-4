import React, { useEffect, useState } from 'react';
import { useMap, ImageOverlay } from 'react-leaflet';
import L from 'leaflet';
import { MethodId } from '../utils/wqi';

export interface SpatialPoint {
  lat: number;
  lng: number;
  score: number;
}

interface InterpolationOverlayProps {
  methodId: MethodId;
  points: SpatialPoint[];
  interpMethod: 'none' | 'idw' | 'kriging' | 'rbf';
  geojson?: any;
}

function getScoreColor(score: number, methodId: MethodId): [number, number, number, number] {
  let hex = '#8884d8';
  if (methodId === 'wawqi') {
    if(score <= 50) hex = '#3b82f6';
    else if(score <= 75) hex = '#f97316';
    else hex = '#ef4444';
  } else if (methodId === 'nsf') {
    if(score >= 90) hex = '#3b82f6';
    else if(score >= 70) hex = '#22c55e';
    else if(score >= 50) hex = '#eab308';
    else if(score >= 25) hex = '#f97316';
    else hex = '#ef4444';
  } else if (methodId === 'owqi') {
    if(score >= 90) hex = '#3b82f6';
    else if(score >= 85) hex = '#22c55e';
    else if(score >= 80) hex = '#eab308';
    else if(score >= 60) hex = '#f97316';
    else hex = '#ef4444';
  } else if (methodId === 'ccme') {
    if(score >= 95) hex = '#3b82f6';
    else if(score >= 80) hex = '#22c55e';
    else if(score >= 65) hex = '#eab308';
    else if(score >= 45) hex = '#f97316';
    else hex = '#ef4444';
  } else if (methodId === 'oip') {
    if(score <= 10) hex = '#3b82f6';
    else if(score <= 20) hex = '#22c55e';
    else if(score <= 50) hex = '#f97316';
    else hex = '#ef4444';
  }

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    170 // Map surface alpha transparency
  ] : [0, 0, 0, 0];
}

function drawGeoJsonToCanvas(ctx: CanvasRenderingContext2D, geojson: any, bounds: L.LatLngBounds, width: number, height: number) {
  if (!geojson) return;

  const n = bounds.getNorth();
  const s = bounds.getSouth();
  const e = bounds.getEast();
  const w = bounds.getWest();

  const project = (coord: [number, number]) => {
    const x = ((coord[0] - w) / (e - w)) * width;
    const y = ((n - coord[1]) / (n - s)) * height;
    return { x, y };
  };

  ctx.beginPath();

  const drawPolygon = (coordinates: any[]) => {
    coordinates.forEach((ring: any[]) => {
      ring.forEach((coord, i) => {
        const pt = project(coord);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
    });
  };

  const processFeature = (geometry: any) => {
    if(!geometry) return;
    if (geometry.type === 'Polygon') {
      drawPolygon(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach((polygonCoords: any[]) => drawPolygon(polygonCoords));
    }
  };

  if (geojson.type === 'FeatureCollection') {
    geojson.features.forEach((feature: any) => {
      if (feature.geometry) processFeature(feature.geometry);
    });
  } else if (geojson.type === 'Feature') {
    processFeature(geojson.geometry);
  } else {
    processFeature(geojson);
  }
}

export function InterpolationOverlay({ methodId, points, interpMethod, geojson }: InterpolationOverlayProps) {
  const map = useMap();
  const [layers, setLayers] = useState<{ url: string; bounds: L.LatLngBounds } | null>(null);

  useEffect(() => {
    if (interpMethod === 'none' || points.length < 2) {
      setLayers(null);
      return;
    }

    const updateSurface = () => {
      const bounds = map.getBounds();
      // Increase bounds slightly to avoid edge clipping during slight pans
      const n = bounds.getNorth() + 0.1;
      const s = bounds.getSouth() - 0.1;
      const e = bounds.getEast() + 0.1;
      const w = bounds.getWest() - 0.1;
      const expandedBounds = L.latLngBounds([s, w], [n, e]);
      
      // Resolution of the interpolated grid
      const width = 100;
      const height = 100;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      // Project points to grid coordinates
      const gridPoints = points.map(p => ({
        x: ((p.lng - w) / (e - w)) * width,
        y: ((n - p.lat) / (n - s)) * height,
        score: p.score
      }));

      // Interpolation logic
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let sumW = 0;
          let sumScore = 0;
          let exactMatch = false;

          for (const pt of gridPoints) {
             const d2 = (pt.x - x)*(pt.x - x) + (pt.y - y)*(pt.y - y);
             if (d2 < 0.05) {
               exactMatch = true;
               sumScore = pt.score;
               sumW = 1;
               break;
             }

             let weight = 0;
             if (interpMethod === 'idw') {
               weight = 1 / d2; // Standard Inverse Distance Weighting
             } else if (interpMethod === 'rbf') {
               weight = Math.exp(-d2 / 300); // Radial Basis Function (Gaussian)
             } else if (interpMethod === 'kriging') {
               const d = Math.sqrt(d2);
               const range = 60; // spherical range approximation
               if (d <= range) {
                  weight = 1 - (1.5 * (d / range) - 0.5 * Math.pow(d / range, 3));
               } else {
                  weight = 0.0001; // small residual nugget
               }
             }
             
             sumW += weight;
             sumScore += pt.score * weight;
          }

          const finalScore = sumW > 0 ? (sumScore / sumW) : 0;
          const color = getScoreColor(finalScore, methodId);

          const idx = (y * width + x) * 4;
          data[idx] = color[0];
          data[idx+1] = color[1];
          data[idx+2] = color[2];
          data[idx+3] = color[3];
        }
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(imgData, 0, 0);
        
        if (geojson) {
          ctx.save();
          drawGeoJsonToCanvas(ctx, geojson, expandedBounds, width, height);
          ctx.clip();
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.restore();
        } else {
          ctx.drawImage(tempCanvas, 0, 0);
        }
      }

      setLayers({ url: canvas.toDataURL('image/png'), bounds: expandedBounds });
    };

    updateSurface();
    map.on('moveend', updateSurface);
    map.on('zoomend', updateSurface);

    return () => {
      map.off('moveend', updateSurface);
      map.off('zoomend', updateSurface);
    };
  }, [map, points, methodId, interpMethod, geojson]);

  if (!layers) return null;
  return <ImageOverlay url={layers.url} bounds={layers.bounds} opacity={0.6} zIndex={10} />;
}

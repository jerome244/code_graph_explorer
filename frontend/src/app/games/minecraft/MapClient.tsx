'use client';
import { useEffect, useState } from 'react';

type Block = { id:number; x:number; y:number; z:number; material:string };

export default function MapClient() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const size = 16;             // map width/height (matches your seed)
  const cell = 24;             // pixel size of a block
  const width = size * cell;
  const height = size * cell;

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/blocks/?world=1&z=0')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setBlocks)
      .catch((err) => {
        console.warn('Failed to load blocks:', err);
      });
  }, []);

  useEffect(() => {
    const canvas = document.getElementById('map') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    for (const b of blocks) {
      ctx.fillStyle = colorFor(b.material);
      ctx.fillRect(b.x * cell, b.y * cell, cell - 1, cell - 1);
    }
  }, [blocks]);

  return <canvas id="map" width={width} height={height} style={{ border: '1px solid #ddd' }} />;

  function colorFor(m: string) {
    switch (m) {
      case 'grass': return '#5cae3e';
      case 'dirt':  return '#8b5a2b';
      case 'stone': return '#9e9e9e';
      case 'water': return '#3daee9';
      case 'sand':  return '#f4e19c';
      case 'wood':  return '#a96e3b';
      default:      return '#cccccc';
    }
  }
}

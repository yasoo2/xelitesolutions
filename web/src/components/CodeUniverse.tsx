import React, { useEffect, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { API_URL } from '../config';

interface Node {
  id: string;
  name: string;
  group: number;
  x?: number;
  y?: number;
  z?: number;
  [key: string]: any;
}

interface GraphData {
  nodes: Node[];
  links: any[];
}

const GROUPS = {
  1: { label: 'API & Routes', color: '#3b82f6' }, // Blue
  2: { label: 'Services', color: '#10b981' }, // Emerald/Green
  3: { label: 'Components', color: '#f59e0b' }, // Amber/Orange
  4: { label: 'Files & Utils', color: '#64748b' }, // Slate/Gray
  5: { label: 'Directories', color: '#8b5cf6' }  // Violet/Purple
};

export default function CodeUniverse() {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const fgRef = useRef<any>();

  useEffect(() => {
    fetch(`${API_URL}/advanced/graph`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-dark)', position: 'relative' }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeLabel="name"
        nodeColor={(node: any) => GROUPS[node.group as keyof typeof GROUPS]?.color || '#999'}
        nodeRelSize={6}
        linkOpacity={0.2}
        linkWidth={1}
        nodeThreeObject={(node: any) => {
            // Optional: Use Three.js sprites for cooler effect
            // For now, default spheres are fine, maybe glowing
            return false; 
        }}
        onNodeClick={(node: any) => {
          // Fly to node
          const n = node as Node;
          if (n.x === undefined || n.y === undefined || n.z === undefined) return;
          
          const distance = 40;
          const distRatio = 1 + distance/Math.hypot(n.x, n.y, n.z);

          fgRef.current.cameraPosition(
            { x: n.x * distRatio, y: n.y * distRatio, z: n.z * distRatio }, // new position
            node, // lookAt ({ x, y, z })
            3000  // ms transition duration
          );
        }}
      />
      <div style={{ position: 'absolute', top: 20, left: 20, color: 'var(--text-primary)', pointerEvents: 'none' }}>
        <h2 style={{ margin: 0, textShadow: '0 0 10px var(--accent-glow)' }}>CODE UNIVERSE</h2>
        <p style={{ margin: 0, opacity: 0.7 }}>{data.nodes.length} Files • {data.links.length} Dependencies</p>
      </div>

      <div style={{ 
        position: 'absolute', 
        bottom: 20, 
        left: 20, 
        padding: '12px', 
        background: 'var(--bg-card)', 
        backdropFilter: 'blur(8px)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Legend</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Object.entries(GROUPS).map(([id, info]) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: info.color }}></span>
              {info.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

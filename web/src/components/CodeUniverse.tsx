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
    <div style={{ width: '100%', height: '100%', background: '#000' }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeLabel="name"
        nodeAutoColorBy="group"
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
      <div style={{ position: 'absolute', top: 20, left: 20, color: '#fff', pointerEvents: 'none' }}>
        <h2 style={{ margin: 0, textShadow: '0 0 10px #00f' }}>CODE UNIVERSE</h2>
        <p style={{ margin: 0, opacity: 0.7 }}>{data.nodes.length} Files • {data.links.length} Dependencies</p>
      </div>
    </div>
  );
}

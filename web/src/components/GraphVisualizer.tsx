import React, { useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphVisualizerProps {
  nodes: any[];
  links: any[];
}

export default function GraphVisualizer({ nodes, links }: GraphVisualizerProps) {
  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 100, height: 100 });

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initial size
    setDimensions({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight
    });

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
            setDimensions({ width, height });
        }
      }
    });
    
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-100);
      fgRef.current.d3Force('link').distance(50);
    }
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={{ nodes, links }}
        nodeLabel="name"
        nodeRelSize={4}
        nodeColor={(node: any) => {
          const ext = node.extension;
          if (ext === '.ts' || ext === '.tsx') return '#3178c6';
          if (ext === '.js' || ext === '.jsx') return '#f1e05a';
          if (ext === '.css' || ext === '.scss') return '#563d7c';
          if (ext === '.html') return '#e34c26';
          if (ext === '.json') return '#cb3837';
          return '#8b949e';
        }}
        linkColor={() => '#30363d'}
        backgroundColor="#0d1117"
        onNodeClick={(node: any) => {
            if (fgRef.current) {
                fgRef.current.centerAt(node.x, node.y, 1000);
                fgRef.current.zoom(8, 2000);
            }
        }}
      />
    </div>
  );
}

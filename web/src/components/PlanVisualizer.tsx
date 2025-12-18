
import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  Node, 
  Edge, 
  ConnectionLineType,
  MarkerType,
  useNodesState,
  useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import { PlayCircle, CheckCircle2, AlertCircle, MessageSquare, Terminal } from 'lucide-react';

interface PlanVisualizerProps {
  messages: any[];
}

const PlanVisualizer: React.FC<PlanVisualizerProps> = ({ messages }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    // Transform messages into a flow
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    let y = 50;
    let x = 250;
    
    // Start Node
    newNodes.push({
      id: 'start',
      type: 'input',
      data: { label: 'Start Request' },
      position: { x, y },
      style: { background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: 10, width: 150, textAlign: 'center' }
    });
    y += 100;

    let lastNodeId = 'start';

    messages.forEach((msg, idx) => {
        if (!msg) return; // Safeguard

        if (msg.role === 'user') {
            const id = `msg-${idx}`;
            newNodes.push({
                id,
                data: { label: <div style={{display:'flex', alignItems:'center', gap:5}}><MessageSquare size={14}/> User Input</div> },
                position: { x, y },
                style: { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', width: 200, fontSize: 12 }
            });
            newEdges.push({ id: `e-${idx}`, source: lastNodeId, target: id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } });
            lastNodeId = id;
            y += 100;
        } else if (msg.role === 'assistant') {
            // Try to parse thoughts/tools
            const content = msg.content || '';
            const toolCalls = msg.tool_calls || [];

            // If there's content, it's a thought or response
            if (content) {
                const id = `thought-${idx}`;
                newNodes.push({
                    id,
                    data: { label: <div style={{display:'flex', alignItems:'center', gap:5}}><PlayCircle size={14} color="var(--accent-secondary)"/> Thinking...</div> },
                    position: { x, y },
                    style: { background: 'var(--bg-secondary)', border: '1px dashed var(--accent-secondary)', color: 'var(--text-secondary)', width: 200, fontSize: 12 }
                });
                newEdges.push({ id: `e-t-${idx}`, source: lastNodeId, target: id, type: 'smoothstep' });
                lastNodeId = id;
                y += 100;
            }

            // If there are tool calls
            toolCalls.forEach((tool: any, tIdx: number) => {
                 const tId = `tool-${idx}-${tIdx}`;
                 newNodes.push({
                    id: tId,
                    data: { label: <div style={{display:'flex', alignItems:'center', gap:5}}><Terminal size={14} color="var(--accent-primary)"/> {tool.function.name}</div> },
                    position: { x: x + (tIdx % 2 === 0 ? -50 : 50), y },
                    style: { background: '#1e1e1e', border: '1px solid var(--accent-primary)', color: '#fff', width: 180, fontSize: 11, borderRadius: 6 }
                });
                // Connect from thought or previous
                newEdges.push({ id: `e-tool-${idx}-${tIdx}`, source: lastNodeId, target: tId, animated: true, type: 'smoothstep' });
                // We don't necessarily update lastNodeId for parallel tools, or we do? 
                // Let's keep lastNodeId as the thought if multiple tools, or the tool if linear. 
                // For simplicity, let's just branch out and keep lastNodeId as the thought for subsequent nodes unless we want a chain.
                // But usually tools are followed by another message. 
                // Let's update lastNodeId to the last tool for now, assuming linear flow roughly.
                lastNodeId = tId;
                y += 80;
            });
        }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [messages, setNodes, setEdges]);

  return (
    <div style={{ height: '100%', width: '100%', background: 'var(--bg-primary)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-right"
      >
        <Background color="#444" gap={16} />
        <Controls style={{ fill: 'var(--text-primary)' }} />
      </ReactFlow>
    </div>
  );
};

export default PlanVisualizer;

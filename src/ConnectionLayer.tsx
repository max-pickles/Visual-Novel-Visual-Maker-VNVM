import React from 'react';
import type { LinkType } from './types';

export type VNLinkKind = 'jump' | 'choice' | 'if_true' | 'if_false' | 'screen' | 'good_path' | 'bad_path' | 'odd_path';

export interface CanvasLink {
  from: string;
  to: string;
  type: LinkType;
  vnType?: VNLinkKind;
}

import { useCanvasStore, useShallow } from './store/canvasStore';

export interface ConnectionLayerProps {
  links: CanvasLink[];
  displayNodes: any[];
  compactCards: boolean;
  dragLineRef?: React.RefObject<SVGPathElement>;
}

export const ConnectionLayer = React.memo(function ConnectionLayer(props: ConnectionLayerProps) {
  const { links, displayNodes, compactCards, dragLineRef } = props;
  const { pan, zoom } = useCanvasStore(useShallow(s => ({ pan: s.pan, zoom: s.zoom })));

  const cubicBezierPath = (sx: number, sy: number, tx: number, ty: number, arrowLen: number = 0): string => {
    const cp = Math.max(60, Math.abs(tx - sx) * 0.5);
    const c1x = sx + cp;
    const c1y = sy;
    const c2x = tx - cp;
    const c2y = ty;
    return `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx - arrowLen},${ty}`;
  };

  const edgeStyle = (vnType: VNLinkKind | undefined) => {
    switch (vnType) {
      case 'choice':    return { stroke: '#f472b6', width: 2.5, dash: undefined };
      case 'if_true':
      case 'good_path': return { stroke: '#4ade80', width: 2.5, dash: undefined };
      case 'odd_path':  return { stroke: '#a78bfa', width: 2.5, dash: undefined };
      case 'if_false':
      case 'bad_path':  return { stroke: '#fb923c', width: 2,   dash: '6 4'    };
      case 'screen':    return { stroke: '#22d3ee', width: 2,   dash: '2 6'    };
      case 'jump':
      default:          return { stroke: '#00d4c8', width: 2.5, dash: undefined };
    }
  };

  const outPortColor = (vnType: VNLinkKind | undefined): string => {
    switch (vnType) {
      case 'choice':    return '#f472b6';
      case 'if_true':
      case 'good_path': return '#4ade80';
      case 'odd_path':  return '#a78bfa';
      case 'if_false':
      case 'bad_path':  return '#fb923c';
      case 'screen':    return '#22d3ee';
      default:          return '#00d4c8';
    }
  };

  const outPortMap = new Map<string, number>(); 
  links.forEach(lk => { outPortMap.set(lk.from, (outPortMap.get(lk.from) ?? 0) + 1); });
  const outPortIndex = new Map<string, number>(); 

  const portDots: { x: number; y: number; color: string; isInput: boolean }[] = [];

  const renderLink = (link: CanvasLink, i: number) => {
    const from = displayNodes.find(n => n.id === link.from);
    const to   = displayNodes.find(n => n.id === link.to);
    if (!from || !to) return null;

    const { stroke, width, dash } = edgeStyle(link.vnType);

    if (compactCards) {
      return <line key={i}
        x1={from.x + from.w / 2} y1={from.y + from.h / 2}
        x2={to.x   + to.w  / 2} y2={to.y   + to.h  / 2}
        stroke={stroke} strokeWidth={1.5} opacity={0.4}
        strokeDasharray={dash} />;
    }

    const outTotal = outPortMap.get(link.from) ?? 1;
    const outIdx   = outPortIndex.get(link.from) ?? 0;
    outPortIndex.set(link.from, outIdx + 1);
    const srcPortY = from.y + (from.h / (outTotal + 1)) * (outIdx + 1);
    const srcPortX = from.x + from.w;
    const tgtPortX = to.x;
    const tgtPortY = to.y + to.h / 2;

    const arrowLen = PORT_R + width * 1.5;
    const pathData = cubicBezierPath(srcPortX, srcPortY, tgtPortX, tgtPortY, arrowLen);

    portDots.push({ x: srcPortX, y: srcPortY, color: outPortColor(link.vnType), isInput: false });
    portDots.push({ x: tgtPortX, y: tgtPortY, color: '#4b6cf7', isInput: true });

    const markerId = `url(#arrow-${stroke.replace('#', '')})`;

    return (
      <path key={`${link.from}-${link.to}-${i}`}
        d={pathData} stroke={stroke} strokeWidth={width}
        fill="none" strokeLinecap="round" strokeDasharray={dash} opacity={0.88}
        markerEnd={markerId}
      />
    );
  };

  const PORT_R     = 5.5;
  const PORT_INNER  = 2.5;
  const BG_FILL     = '#0d0f1a';

  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <style>{`@keyframes flowDash { to { stroke-dashoffset: -20; } }`}</style>
      <defs>
        {['#00d4c8', '#f472b6', '#4ade80', '#fb923c', '#22d3ee', '#4b6cf7', '#a78bfa'].map(c => (
          <marker key={c} id={`arrow-${c.replace('#', '')}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill={c} />
          </marker>
        ))}
      </defs>
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {links.map((lk, i) => renderLink(lk, i))}
        {portDots.map((d, i) => (
          <g key={`dot-${i}`}>
            <circle cx={d.x} cy={d.y} r={PORT_R} fill={d.color} />
            <circle cx={d.x} cy={d.y} r={PORT_INNER} fill={BG_FILL} />
          </g>
        ))}
        <path ref={dragLineRef} fill="none" stroke="var(--acc)" strokeWidth="3" strokeDasharray="6 4" strokeLinecap="round" style={{ display: 'none', filter: 'drop-shadow(0 0 6px var(--acc))', animation: 'flowDash 0.5s linear infinite' }} />
      </g>
    </svg>
  );
});

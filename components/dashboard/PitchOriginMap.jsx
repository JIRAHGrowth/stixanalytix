"use client";
import { tDark } from "@/lib/theme";

export default function PitchOriginMap({ origins, title, theme }) {
  const t = theme || tDark;
  if (!origins || Object.keys(origins).length === 0) {
    return <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No origin data</div>;
  }

  const maxVal = Math.max(...Object.values(origins), 1);
  const vizZones = [
    {key:"wideL", x:3, y:3, w:15, h:78, label:["Wide","Left"], val:(origins.cornerL||0)+(origins.outL||0)},
    {key:"channelL", x:18, y:3, w:14, h:48, label:["Left","Channel"], val:origins.boxL||0},
    {key:"6yard", x:32, y:3, w:36, h:19, label:["6-Yard Box"], val:origins["6yard"]||0},
    {key:"central", x:32, y:22, w:36, h:29, label:["Central Box"], val:(origins.boxC||0)+(origins.penalty||0)},
    {key:"channelR", x:68, y:3, w:14, h:48, label:["Right","Channel"], val:origins.boxR||0},
    {key:"wideR", x:82, y:3, w:15, h:78, label:["Wide","Right"], val:(origins.cornerR||0)+(origins.outR||0)},
    {key:"outside", x:18, y:51, w:64, h:30, label:["Outside","the Box"], val:origins.outC||0},
  ];
  const vizMax = Math.max(...vizZones.map(z=>z.val), 1);

  return (
    <div style={{textTransform:"none"}}>
      <svg viewBox="0 0 100 85" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
        <rect x="0" y="0" width="100" height="85" rx="3" fill={t.bg} stroke={t.border} strokeWidth="0.5"/>
        <rect x="30" y="0" width="40" height="3" rx="1" fill={t.dim} opacity="0.3"/>
        <text x="50" y="2" textAnchor="middle" fill={t.bright} fontSize="2.8" fontWeight="700" letterSpacing="1">GOAL</text>
        <line x1="18" y1="3" x2="18" y2="81" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
        <line x1="82" y1="3" x2="82" y2="81" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
        <line x1="32" y1="3" x2="32" y2="51" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
        <line x1="68" y1="3" x2="68" y2="51" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
        <line x1="32" y1="22" x2="68" y2="22" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
        <line x1="18" y1="51" x2="82" y2="51" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
        {vizZones.map(z => {
          const cx=z.x+z.w/2, cy=z.y+z.h/2;
          const isNarrow=z.w<=15, isTall=z.h>=40;
          const fontSize=isNarrow?2.5:(z.w>30?3.5:3);
          const valSize=z.val>0?(isNarrow?5.5:7.5):(isNarrow?3.5:4.5);
          const intensity=z.val>0?(0.15+(z.val/vizMax)*0.6):0;
          const valY=isTall?(z.y+z.h*0.35):(cy-3);
          const lblY=isTall?(z.y+z.h*0.55):(cy+4);
          return (
            <g key={z.key}>
              {z.val > 0 && <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="1.5" fill={"rgba(239,68,68,"+intensity+")"}/>}
              <text x={cx} y={valY} textAnchor="middle" dominantBaseline="middle" fill={z.val>0?t.bright:t.dim} fontSize={valSize} fontWeight="800" opacity={z.val>0?1:0.3}>{z.val}</text>
              <text x={cx} textAnchor="middle" fill={z.val>0?"rgba(255,255,255,0.75)":t.dim} fontSize={fontSize} fontWeight={z.val>0?"600":"500"}>
                {z.label.map((line,i) => <tspan key={i} x={cx} y={i===0?lblY:undefined} dy={i>0?(fontSize+0.8):undefined}>{line}</tspan>)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

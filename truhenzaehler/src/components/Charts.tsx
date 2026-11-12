"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Kategorische Palette (farbfehlsichtig-freundliche Reihenfolge)
export const PALETTE = ["#d49b22", "#2b7bb9", "#3a9e6f", "#c2553a", "#7b5fb3", "#4aa3a8", "#b8607f", "#7d8a99"];
const axis = { fontSize: 11, fill: "currentColor" };
const tip = { contentStyle: { borderRadius: 8, fontSize: 12, color: "#0f172a" } };

export function DailyChart({ data }: { data: { label: string; regular: number; event: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: -16, right: 4 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tip} formatter={(v: number) => v.toLocaleString("de-DE")} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="regular" name="Regulär" stackId="a" fill={PALETTE[0]} radius={[0, 0, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="event" name="Event" stackId="a" fill={PALETTE[4]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, valueLabel = "Punkte" }: { data: { name: string; value: number }[]; valueLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={110} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tip} formatter={(v: number) => [v.toLocaleString("de-DE"), valueLabel]} />
        <Bar isAnimationActive={false} dataKey="value" fill={PALETTE[1]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v: number) => v.toLocaleString("de-DE")} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

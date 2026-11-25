// A light stand-in for Recharts. jsdom cannot lay charts out, so this renders what a chart is given
// (its data, its series and the results of its formatters) as plain elements tests can read.
import type { ReactNode } from 'react';

export const ResponsiveContainer = ({ children }: { children?: ReactNode }) => <div data-testid="responsive-container">{children}</div>;

const chart = (kind: string) =>
  function Chart({ data, children }: { data?: unknown[]; children?: ReactNode }) {
    return (
      <div data-testid={kind} data-chart={JSON.stringify(data ?? [])}>
        {children}
      </div>
    );
  };
export const BarChart = chart('bar-chart');
export const LineChart = chart('line-chart');
export const PieChart = chart('pie-chart');

export const CartesianGrid = () => null;
export const XAxis = () => null;
export const Legend = () => null;

/** The tick formatter is run on a sample value so its output can be checked. */
export const YAxis = ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => (
  <span data-testid="y-tick">{tickFormatter?.(1500000)}</span>
);

/** The tooltip formatter is run on a sample value so its output can be checked. */
export const Tooltip = ({ formatter }: { formatter?: (v: unknown) => string }) => <span data-testid="tooltip-sample">{formatter?.(1234.4)}</span>;

export const Bar = ({ dataKey, name, fill, stackId }: { dataKey: string; name?: string; fill?: string; stackId?: string }) => (
  <span data-testid="series" data-kind="bar" data-key={dataKey} data-name={name ?? dataKey} data-fill={fill} data-stack={stackId} />
);
export const Line = ({ dataKey, name, stroke }: { dataKey: string; name?: string; stroke?: string }) => (
  <span data-testid="series" data-kind="line" data-key={dataKey} data-name={name ?? dataKey} data-fill={stroke} />
);
export const Pie = ({ data, children }: { data?: unknown[]; children?: ReactNode }) => (
  <div data-testid="pie" data-pie={JSON.stringify(data ?? [])}>
    {children}
  </div>
);
export const Cell = ({ fill }: { fill?: string }) => <span data-testid="cell" data-fill={fill} />;

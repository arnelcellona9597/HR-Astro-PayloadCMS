export type SeriesSlot = 1 | 2 | 3 | 4

export type ChartKind = 'bar' | 'line' | 'area' | 'doughnut'

export type ChartSpec = {
  /** Defaults to 'bar'. 'area' is a line with a soft fill. 'doughnut' uses series[0] with one slice per label. */
  kind?: ChartKind
  labels: string[]
  series: { label: string; data: number[]; slot: SeriesSlot }[]
  /** Doughnut only: the series colour slot for each slice (same order as labels). */
  sliceSlots?: SeriesSlot[]
  horizontal?: boolean
  stacked?: boolean
  /** Show each bar's value at its tip (single-series bar charts only). */
  valueLabels?: boolean
  /** Unit shown in tooltips, e.g. "employees". */
  unit?: string
}

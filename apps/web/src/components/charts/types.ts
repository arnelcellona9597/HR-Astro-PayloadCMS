export type SeriesSlot = 1 | 2 | 3 | 4

export type BarSpec = {
  labels: string[]
  series: { label: string; data: number[]; slot: SeriesSlot }[]
  horizontal?: boolean
  stacked?: boolean
  /** Show each bar's value at its tip (single-series charts only). */
  valueLabels?: boolean
  /** Unit shown in tooltips, e.g. "employees". */
  unit?: string
}

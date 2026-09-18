import React from "react";
import { View, Text } from "react-native";
import Svg, { Rect } from "react-native-svg";

interface TrendPoint {
  month: string; // "YYYY-MM"
  income: number;
  expenses: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  incomeColor: string;
  expenseColor: string;
  labelColor: string;
  height?: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Grouped bar chart comparing income vs. expenses per month.
 * Bar heights are scaled against the largest value across the whole series.
 */
const TrendChart: React.FC<TrendChartProps> = ({
  data,
  incomeColor,
  expenseColor,
  labelColor,
  height = 140,
}) => {
  const maxValue = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]));
  const columnWidth = 100 / data.length;
  const barWidth = Math.min(14, columnWidth * 0.32);

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {data.map((point, index) => {
          const columnCenter = columnWidth * index + columnWidth / 2;
          const incomeHeight = (point.income / maxValue) * (height - 4);
          const expenseHeight = (point.expenses / maxValue) * (height - 4);
          return (
            <React.Fragment key={point.month}>
              <Rect
                x={columnCenter - barWidth - 1}
                y={height - incomeHeight}
                width={barWidth}
                height={Math.max(incomeHeight, point.income > 0 ? 1 : 0)}
                rx={2}
                fill={incomeColor}
              />
              <Rect
                x={columnCenter + 1}
                y={height - expenseHeight}
                width={barWidth}
                height={Math.max(expenseHeight, point.expenses > 0 ? 1 : 0)}
                rx={2}
                fill={expenseColor}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {data.map((point) => {
          const [, monthNum] = point.month.split("-");
          const label = MONTH_LABELS[parseInt(monthNum, 10) - 1] || point.month;
          return (
            <View key={point.month} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: labelColor }}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default TrendChart;

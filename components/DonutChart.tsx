import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface DonutSlice {
  amount: number;
  color: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  centerLabelColor: string;
  centerValueColor: string;
  trackColor: string;
}

/**
 * Renders a proportional donut chart by drawing one stroked circle per
 * slice and rotating/offsetting its dash pattern to sit after the previous
 * slice. react-native-svg doesn't support multi-color strokes directly,
 * so each slice is its own circle sharing the same radius.
 */
const DonutChart: React.FC<DonutChartProps> = ({
  slices,
  size = 100,
  strokeWidth = 16,
  centerLabel,
  centerValue,
  centerLabelColor,
  centerValueColor,
  trackColor,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  let offsetSoFar = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {total > 0 &&
          slices.map((slice, index) => {
            if (slice.amount <= 0) return null;
            const sliceLength = (slice.amount / total) * circumference;
            const dashArray = `${sliceLength} ${circumference - sliceLength}`;
            const dashOffset = circumference - offsetSoFar;
            offsetSoFar += sliceLength;
            return (
              <Circle
                key={index}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                fill="none"
                // Rotate so the first slice starts at 12 o'clock.
                rotation={-90}
                originX={size / 2}
                originY={size / 2}
              />
            );
          })}
      </Svg>
      {(centerLabel || centerValue) && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {centerValue && (
            <Text
              style={{ fontSize: size * 0.14, fontWeight: "bold", color: centerValueColor }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {centerValue}
            </Text>
          )}
          {centerLabel && (
            <Text style={{ fontSize: size * 0.09, color: centerLabelColor, marginTop: 2 }}>
              {centerLabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default DonutChart;

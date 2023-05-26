import React, { useState } from 'react';
import { Slider } from '@mui/material';

interface SliderComponentProps {
  windowSize: number;
  shortWindowSize: number;
  onSettingsChange: (property: string, value: number) => void;
}

const SliderComponent: React.FC<SliderComponentProps> = ({
  windowSize,
  shortWindowSize,
  onSettingsChange,
}) => {
  const [sliderValues, setSliderValues] = useState<[number, number]>([
    shortWindowSize,
    windowSize,
  ]);

  const handleValuesChange = (
    event: Event,
    newValues: number | number[]
  ): void => {
    setSliderValues(Array.isArray(newValues) ? (newValues as [number, number]) : [newValues, windowSize]);
  };

  const handleValuesChangeEnd = (): void => {
    const [newSmallWindowSize, newWindowSize] = sliderValues;
    onSettingsChange('shortWindowSize', newSmallWindowSize);
    onSettingsChange('windowSize', Math.max(newSmallWindowSize + 1, newWindowSize));
  };

  const valueLabelFormat = (value: number): string => {
    if (value === shortWindowSize) {
      return `Short Rolling Average Window Size: ${value}`;
    }
    if (value === windowSize) {
      return `Long Rolling Average Window Size: ${value}`;
    }
    return `${value}`;
  };

  return (
    <div style={{ width: '40%'}}>
      <Slider
        value={[shortWindowSize, windowSize]}
        onChange={handleValuesChange}
        onChangeCommitted={handleValuesChangeEnd}
        valueLabelDisplay="auto"
        valueLabelFormat={valueLabelFormat}
        min={1}
        max={200}
        step={1}
      />
    </div>
  );
};

export default SliderComponent;
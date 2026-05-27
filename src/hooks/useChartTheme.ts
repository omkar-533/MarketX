import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

export function useChartTheme() {
  const { isDark } = useTheme();

  return useMemo(() => {
    if (isDark) {
      return {
        tooltip: {
          backgroundColor: '#0b0e17',
          border: '1px solid #1a1f2e',
          borderRadius: 8,
          fontSize: 11,
          color: '#e2e8f0',
        },
        grid: '#1a1f2e',
        axis: '#64748b',
      };
    }
    return {
      tooltip: {
        backgroundColor: '#ffffff',
        border: '1px solid #c8d4e3',
        borderRadius: 8,
        fontSize: 11,
        color: '#0f172a',
      },
      grid: '#dce4ef',
      axis: '#64748b',
    };
  }, [isDark]);
}

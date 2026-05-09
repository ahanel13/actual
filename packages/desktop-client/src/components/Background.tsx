import { theme } from '@actual-app/components/theme';

export function Background() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: theme.pageBackground,
      }}
    />
  );
}

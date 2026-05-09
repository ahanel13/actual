import { forwardRef } from 'react';
import type { ComponentProps } from 'react';

import { theme } from './theme';
import { View } from './View';

type CardProps = ComponentProps<typeof View>;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, ...props }, ref) => {
    return (
      <View
        {...props}
        ref={ref}
        style={{
          marginTop: 15,
          marginLeft: 5,
          marginRight: 5,
          borderRadius: 12,
          backgroundColor: theme.cardBackground,
          borderColor: theme.cardBorder,
          boxShadow: '0px 2px 4px rgba(34, 32, 29, 0.10)',
          ...props.style,
        }}
      >
        <View
          style={{
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      </View>
    );
  },
);

Card.displayName = 'Card';

// @ts-strict-ignore
import React from 'react';
import type {
  ComponentProps,
  ComponentType,
  CSSProperties,
  SVGProps,
} from 'react';

import { Block } from '@actual-app/components/block';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { accountNameStyle } from './Account';
import { ItemContent } from './ItemContent';

const fontWeight = 600;

type SecondaryItemProps = {
  title: string;
  to?: string;
  Icon?:
    | ComponentType<SVGProps<SVGElement>>
    | ComponentType<SVGProps<SVGSVGElement>>;
  style?: CSSProperties;
  onClick?: ComponentProps<typeof ItemContent>['onClick'];
  bold?: boolean;
  indent?: number;
};

export function SecondaryItem({
  Icon,
  title,
  style,
  to,
  onClick,
  bold,
  indent = 0,
}: SecondaryItemProps) {
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 16,
      }}
    >
      {Icon && <Icon width={12} height={12} />}
      <Block style={{ marginLeft: Icon ? 8 : 0, color: 'inherit' }}>
        {title}
      </Block>
    </View>
  );

  return (
    <View
      style={{ flexShrink: 0, paddingLeft: 8, paddingRight: 8, ...style }}
    >
      <ItemContent
        style={{
          ...accountNameStyle,
          color: theme.sidebarItemText,
          paddingLeft: 11 + indent,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 8,
          fontWeight: bold ? fontWeight : null,
          ':hover': {
            backgroundColor: theme.sidebarItemBackgroundHover,
            borderRadius: 8,
          },
        }}
        to={to}
        onClick={onClick}
        activeStyle={{
          backgroundColor: theme.sidebarItemAccentSelected,
          borderRadius: 8,
          color: theme.sidebarItemTextSelected,
          fontWeight: fontWeight,
        }}
      >
        {content}
      </ItemContent>
    </View>
  );
}

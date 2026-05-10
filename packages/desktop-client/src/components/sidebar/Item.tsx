// @ts-strict-ignore
import React from 'react';
import type {
  ComponentProps,
  ComponentType,
  CSSProperties,
  ReactNode,
  SVGProps,
} from 'react';

import { Block } from '@actual-app/components/block';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { ItemContent } from './ItemContent';

type ItemProps = {
  title: string;
  Icon:
    | ComponentType<SVGProps<SVGElement>>
    | ComponentType<SVGProps<SVGSVGElement>>;
  to?: string;
  children?: ReactNode;
  style?: CSSProperties;
  indent?: number;
  onClick?: ComponentProps<typeof ItemContent>['onClick'];
  forceHover?: boolean;
  forceActive?: boolean;
};

export function Item({
  children,
  Icon,
  title,
  style,
  to,
  onClick,
  indent = 0,
  forceHover = false,
  forceActive = false,
}: ItemProps) {
  const hoverStyle = {
    backgroundColor: theme.sidebarItemBackgroundHover,
    borderRadius: 8,
  };

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 24,
      }}
    >
      <Icon width={16} height={16} />
      <Block style={{ marginLeft: 8 }}>{title}</Block>
      <View style={{ flex: 1 }} />
    </View>
  );

  return (
    <View style={{ flexShrink: 0, paddingLeft: 8, paddingRight: 8, ...style }}>
      <ItemContent
        style={{
          ...styles.mediumText,
          paddingTop: 10,
          paddingBottom: 10,
          paddingLeft: 11 + indent,
          paddingRight: 10,
          borderRadius: 8,
          textDecoration: 'none',
          color: theme.sidebarItemText,
          ...(forceHover ? hoverStyle : {}),
          ':hover': hoverStyle,
        }}
        forceActive={forceActive}
        activeStyle={{
          backgroundColor: theme.sidebarItemAccentSelected,
          borderRadius: 8,
          color: theme.sidebarItemTextSelected,
          fontWeight: 600,
        }}
        to={to}
        onClick={onClick}
      >
        {content}
      </ItemContent>
      {children ? <View style={{ marginTop: 5 }}>{children}</View> : null}
    </View>
  );
}

import React, { Fragment, useCallback, useMemo, useState } from 'react';
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ComponentType,
  CSSProperties,
  ReactElement,
  ReactNode,
  SVGProps,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgAdd, SvgSplit } from '@actual-app/components/icons/v0';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { TextOneLine } from '@actual-app/components/text-one-line';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { getNormalisedString } from '@actual-app/core/shared/normalisation';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { css, cx } from '@emotion/css';

import { useCreateCategoryMutation } from '#budget';
import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import { makeAmountFullStyle } from '#components/budget/util';
import { FinancialText } from '#components/FinancialText';
import { useCategories } from '#hooks/useCategories';
import { useSheetValue } from '#hooks/useSheetValue';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { envelopeBudget, trackingBudget } from '#spreadsheet/bindings';

import { Autocomplete, defaultFilterSuggestion } from './Autocomplete';
import { rankAutocompleteMatch } from './autocompleteRanking';
import { ItemHeader } from './ItemHeader';

type CategoryAutocompleteItem = Omit<CategoryEntity, 'group'> & {
  group?: CategoryGroupEntity;
};

type CategoryListProps = {
  items: CategoryAutocompleteItem[];
  getItemProps?: (arg: {
    item: CategoryAutocompleteItem;
  }) => Partial<ComponentProps<typeof View>>;
  highlightedIndex: number;
  inputValue?: string;
  embedded?: boolean;
  footer?: ReactNode;
  renderSplitTransactionButton?: (
    props: ComponentPropsWithoutRef<typeof SplitTransactionButton>,
  ) => ReactElement<typeof SplitTransactionButton>;
  renderCategoryItemGroupHeader?: (
    props: ComponentPropsWithoutRef<typeof ItemHeader>,
  ) => ReactElement<typeof ItemHeader>;
  renderCategoryItem?: (
    props: ComponentPropsWithoutRef<typeof CategoryItem>,
  ) => ReactElement<typeof CategoryItem>;
  showHiddenItems?: boolean;
  showBalances?: boolean;
};

function makeNew(id: string | null, rawCategory: string) {
  if (id === 'new' && !rawCategory.startsWith('new:')) {
    return 'new:' + rawCategory;
  }
  return id;
}

function stripNew(value: string | null | undefined) {
  if (typeof value === 'string' && value.startsWith('new:')) {
    return 'new';
  }
  return value;
}
function CategoryList({
  items,
  getItemProps,
  highlightedIndex,
  inputValue,
  embedded,
  footer,
  renderSplitTransactionButton = defaultRenderSplitTransactionButton,
  renderCategoryItemGroupHeader = defaultRenderCategoryItemGroupHeader,
  renderCategoryItem = defaultRenderCategoryItem,
  showHiddenItems,
  showBalances,
}: CategoryListProps) {
  const { t } = useTranslation();
  const { splitTransaction, createCategoryItem, groupedCategories } =
    useMemo(() => {
      return items.reduce(
        (acc, item, index) => {
          if (item.id === 'split') {
            acc.splitTransaction = { ...item, highlightedIndex: index };
            return acc;
          }
          if (item.id === 'new') {
            acc.createCategoryItem = { ...item, highlightedIndex: index };
            return acc;
          }

          const groupId = item.group?.id || '';
          const existing = acc.groupedCategories.find(
            x => x.group?.id === groupId,
          );
          const itemWithIndex = {
            ...item,
            highlightedIndex: index,
          };

          if (!existing) {
            acc.groupedCategories.push({
              group: item.group ?? null,
              categories: [itemWithIndex],
            });
          } else {
            existing.categories.push(itemWithIndex);
          }

          return acc;
        },
        {
          splitTransaction: null,
          createCategoryItem: null,
          groupedCategories: [],
        } as {
          splitTransaction:
            | (CategoryAutocompleteItem & {
                highlightedIndex: number;
              })
            | null;
          createCategoryItem:
            | (CategoryAutocompleteItem & {
                highlightedIndex: number;
              })
            | null;
          groupedCategories: Array<{
            group: CategoryGroupEntity | null;
            categories: Array<
              CategoryAutocompleteItem & { highlightedIndex: number }
            >;
          }>;
        },
      );
    }, [items]);

  return (
    <View>
      <View
        style={{
          overflowY: 'auto',
          willChange: 'transform',
          padding: '5px 0',
          ...(!embedded && { maxHeight: 175 }),
        }}
      >
        {createCategoryItem &&
          (() => {
            const buttonProps = getItemProps
              ? getItemProps({ item: createCategoryItem })
              : {};
            const { onClick, ...restButtonProps } = buttonProps;
            return (
              <CreateCategoryButton
                key="new-category"
                {...restButtonProps}
                onClick={onClick}
                categoryName={inputValue || ''}
                highlighted={
                  createCategoryItem.highlightedIndex === highlightedIndex
                }
                embedded={embedded}
              />
            );
          })()}
        {splitTransaction &&
          (() => {
            const splitButtonProps = getItemProps
              ? getItemProps({ item: splitTransaction })
              : {};
            const { onClick, ...restSplitButtonProps } = splitButtonProps;
            return renderSplitTransactionButton({
              key: 'split',
              ...restSplitButtonProps,
              onClick,
              highlighted:
                splitTransaction.highlightedIndex === highlightedIndex,
              embedded,
            });
          })()}
        {groupedCategories.map(({ group, categories }) => {
          if (!group) {
            return null;
          }

          return (
            <Fragment key={group.id}>
              {renderCategoryItemGroupHeader({
                title: `${group.name}${group.hidden ? ` ${t('(hidden)')}` : ''}`,
                style: {
                  ...(showHiddenItems &&
                    group.hidden && { color: theme.pageTextSubdued }),
                },
              })}
              {categories.map(item => (
                <Fragment key={item.id}>
                  {renderCategoryItem({
                    ...(getItemProps ? getItemProps({ item }) : {}),
                    item,
                    highlighted: highlightedIndex === item.highlightedIndex,
                    embedded,
                    style: {
                      ...(showHiddenItems &&
                        (item.hidden || group.hidden) && {
                          color: theme.pageTextSubdued,
                        }),
                    },
                    showBalances,
                  })}
                </Fragment>
              ))}
            </Fragment>
          );
        })}
      </View>
      {footer}
    </View>
  );
}

function customSort(obj: CategoryAutocompleteItem, value: string): number {
  if (obj.id === 'split') {
    return -6;
  }
  const nameRank = rankAutocompleteMatch(obj.name, value);
  if (nameRank < 0) {
    return nameRank;
  }
  // Group name matching: ranks above no-match but below all name tiers.
  const groupName = obj.group ? getNormalisedString(obj.group.name) : '';
  if (groupName.includes(getNormalisedString(value))) {
    return -0.5;
  }
  return 0;
}

type CategoryAutocompleteProps = ComponentProps<
  typeof Autocomplete<CategoryAutocompleteItem>
> & {
  categoryGroups?: Array<CategoryGroupEntity>;
  showBalances?: boolean;
  showSplitOption?: boolean;
  /**
   * When true, an extra "Create category 'X'" option is offered when the
   * user's typed input doesn't match an existing category. The new category
   * is created in the first non-income, non-hidden group.
   */
  allowCreate?: boolean;
  renderSplitTransactionButton?: (
    props: ComponentPropsWithoutRef<typeof SplitTransactionButton>,
  ) => ReactElement<typeof SplitTransactionButton>;
  renderCategoryItemGroupHeader?: (
    props: ComponentPropsWithoutRef<typeof ItemHeader>,
  ) => ReactElement<typeof ItemHeader>;
  renderCategoryItem?: (
    props: ComponentPropsWithoutRef<typeof CategoryItem>,
  ) => ReactElement<typeof CategoryItem>;
  showHiddenCategories?: boolean;
};

export function CategoryAutocomplete({
  categoryGroups,
  showBalances = true,
  showSplitOption,
  allowCreate = false,
  embedded,
  closeOnBlur,
  value,
  inputProps,
  onSelect,
  onUpdate,
  renderSplitTransactionButton,
  renderCategoryItemGroupHeader,
  renderCategoryItem,
  showHiddenCategories,
  ...props
}: CategoryAutocompleteProps) {
  const { data: { grouped: defaultCategoryGroups } = { grouped: [] } } =
    useCategories();
  const createCategoryMutation = useCreateCategoryMutation();
  const [rawCategory, setRawCategory] = useState('');
  const hasCategoryInput = !!rawCategory;

  const categorySuggestions: CategoryAutocompleteItem[] = useMemo(() => {
    const sourceGroups = categoryGroups || defaultCategoryGroups;
    const allSuggestions = sourceGroups.reduce(
      (list, group) =>
        list.concat(
          (group.categories || [])
            .filter(category => category.group === group.id)
            .map(category => ({
              ...category,
              group,
            })),
        ),
      showSplitOption
        ? [{ id: 'split', name: '' } as CategoryAutocompleteItem]
        : [],
    );

    const filtered = !showHiddenCategories
      ? allSuggestions.filter(
          suggestion =>
            suggestion.id === 'split' ||
            (!suggestion.hidden && !suggestion.group?.hidden),
        )
      : allSuggestions;

    // Offer "Create category" as a synthetic option only when the user has
    // typed something — keeps the option out of the default unfiltered list.
    if (allowCreate && hasCategoryInput) {
      return [{ id: 'new', name: '' } as CategoryAutocompleteItem, ...filtered];
    }
    return filtered;
  }, [
    categoryGroups,
    defaultCategoryGroups,
    showSplitOption,
    showHiddenCategories,
    allowCreate,
    hasCategoryInput,
  ]);

  const handleSelect = useCallback(
    async (idOrIds: string | string[] | null, inputValue: string) => {
      const sourceGroups = categoryGroups || defaultCategoryGroups;
      const targetGroup = sourceGroups.find(
        g => !g.is_income && !g.is_savings && !g.hidden,
      );

      const create = async (name: string): Promise<string | null> => {
        if (!targetGroup) return null;
        try {
          const id = await createCategoryMutation.mutateAsync({
            name,
            groupId: targetGroup.id,
            isIncome: false,
            isHidden: false,
          });
          return id ?? null;
        } catch {
          return null;
        }
      };

      let resolved: string | string[] | null = idOrIds;
      if (Array.isArray(idOrIds)) {
        resolved = await Promise.all(
          idOrIds.map(v => (v === 'new' ? create(inputValue) : v)),
        ).then(arr => arr.filter((v): v is string => !!v));
      } else if (idOrIds === 'new') {
        resolved = await create(inputValue);
      }

      // Autocomplete onSelect intersects single/multi types; cast.
      (onSelect as ((id: unknown, v: string) => void) | undefined)?.(
        resolved,
        inputValue,
      );
    },
    [categoryGroups, defaultCategoryGroups, createCategoryMutation, onSelect],
  );

  const filterSuggestions = useCallback(
    (
      suggestions: CategoryAutocompleteItem[],
      value: string,
    ): CategoryAutocompleteItem[] => {
      const normalizedValue = getNormalisedString(value);
      return suggestions
        .filter(suggestion => {
          if (suggestion.id === 'split') {
            return true;
          }
          if (suggestion.id === 'new') {
            // Hide the create option when the input is empty.
            return !!value;
          }

          if (suggestion.group) {
            return (
              getNormalisedString(suggestion.group.name).includes(
                normalizedValue,
              ) ||
              getNormalisedString(
                suggestion.group.name + ' ' + suggestion.name,
              ).includes(normalizedValue)
            );
          }

          return defaultFilterSuggestion(suggestion, value);
        })
        .sort(
          (a, b) =>
            customSort(a, normalizedValue) - customSort(b, normalizedValue),
        );
    },
    [],
  );

  return (
    <Autocomplete
      strict
      highlightFirst
      embedded={embedded}
      closeOnBlur={closeOnBlur}
      value={value as never}
      itemToString={item => {
        if (!item) return '';
        if (item.id === 'new') return rawCategory;
        return item.name;
      }}
      inputProps={{
        ...inputProps,
        onChangeValue: setRawCategory,
      }}
      onUpdate={onUpdate}
      // Autocomplete declares onSelect as (string & string[]) which is the
      // intersection of single- and multi-select. handleSelect handles both
      // shapes at runtime; cast to satisfy the type checker.
      onSelect={handleSelect as never}
      getHighlightedIndex={suggestions => {
        if (suggestions.length === 0) {
          return null;
        }
        const firstId = suggestions[0].id;
        if (firstId === 'split' || firstId === 'new') {
          // Skip non-category options when picking a default highlight.
          return suggestions.length > 1 ? 1 : 0;
        }
        return 0;
      }}
      filterSuggestions={filterSuggestions}
      suggestions={categorySuggestions}
      renderItems={(items, getItemProps, highlightedIndex, inputValue) => (
        <CategoryList
          items={items}
          embedded={embedded}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          inputValue={inputValue}
          renderSplitTransactionButton={renderSplitTransactionButton}
          renderCategoryItemGroupHeader={renderCategoryItemGroupHeader}
          renderCategoryItem={renderCategoryItem}
          showHiddenItems={showHiddenCategories}
          showBalances={showBalances}
        />
      )}
      {...props}
    />
  );
}

type CreateCategoryButtonProps = ComponentPropsWithoutRef<typeof View> & {
  categoryName: string;
  highlighted?: boolean;
  embedded?: boolean;
};

function CreateCategoryButton({
  categoryName,
  highlighted,
  embedded,
  style,
  ...props
}: CreateCategoryButtonProps) {
  const { isNarrowWidth } = useResponsive();
  const narrowStyle = isNarrowWidth ? styles.mobileMenuItem : {};
  const iconSize = isNarrowWidth ? 14 : 8;
  return (
    <View
      data-testid="create-category-button"
      style={{
        display: 'block',
        flex: '1 0',
        color: highlighted
          ? theme.menuAutoCompleteTextHover
          : theme.noticeTextMenu,
        borderRadius: embedded ? 4 : 0,
        fontSize: 11,
        fontWeight: 500,
        padding: '6px 9px',
        backgroundColor: highlighted
          ? theme.menuAutoCompleteBackgroundHover
          : 'transparent',
        ':active': {
          backgroundColor: 'rgba(100, 100, 100, .25)',
        },
        ...narrowStyle,
        ...style,
      }}
      {...props}
    >
      <SvgAdd
        width={iconSize}
        height={iconSize}
        style={{ marginRight: 5, display: 'inline-block' }}
      />
      <Trans>Create category "{{ categoryName }}"</Trans>
    </View>
  );
}

function defaultRenderCategoryItemGroupHeader(
  props: ComponentPropsWithoutRef<typeof ItemHeader>,
): ReactElement<typeof ItemHeader> {
  return <ItemHeader {...props} type="category" />;
}

type SplitTransactionButtonProps = ComponentPropsWithoutRef<typeof View> & {
  Icon?: ComponentType<SVGProps<SVGElement>>;
  highlighted?: boolean;
  embedded?: boolean;
  style?: CSSProperties;
};

function SplitTransactionButton({
  Icon,
  highlighted,
  embedded,
  style,
  ...props
}: SplitTransactionButtonProps) {
  return (
    <View
      // Downshift calls `setTimeout(..., 250)` in the `onMouseMove`
      // event handler they set on this element. When this code runs
      // in WebKit on touch-enabled devices, taps on this element end
      // up not triggering the `onClick` event (and therefore delaying
      // response to user input) until after the `setTimeout` callback
      // finishes executing. This is caused by content observation code
      // that implements various strategies to prevent the user from
      // accidentally clicking content that changed as a result of code
      // run in the `onMouseMove` event.
      //
      // Long story short, we don't want any delay here between the user
      // tapping and the resulting action being performed. It turns out
      // there's some "fast path" logic that can be triggered in various
      // ways to force WebKit to bail on the content observation process.
      // One of those ways is setting `role="button"` (or a number of
      // other aria roles) on the element, which is what we're doing here.
      //
      // ref:
      // * https://github.com/WebKit/WebKit/blob/447d90b0c52b2951a69df78f06bb5e6b10262f4b/LayoutTests/fast/events/touch/ios/content-observation/400ms-hover-intent.html
      // * https://github.com/WebKit/WebKit/blob/58956cf59ba01267644b5e8fe766efa7aa6f0c5c/Source/WebCore/page/ios/ContentChangeObserver.cpp
      // * https://github.com/WebKit/WebKit/blob/58956cf59ba01267644b5e8fe766efa7aa6f0c5c/Source/WebKit/WebProcess/WebPage/ios/WebPageIOS.mm#L783
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      style={{
        backgroundColor: highlighted
          ? theme.menuAutoCompleteBackgroundHover
          : 'transparent',
        borderRadius: embedded ? 4 : 0,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        fontSize: 11,
        fontWeight: 500,
        color: theme.noticeTextMenu,
        padding: '6px 8px',
        ':active': {
          backgroundColor: 'rgba(100, 100, 100, .25)',
        },
        ...style,
      }}
      data-testid="split-transaction-button"
      {...props}
    >
      <Text style={{ lineHeight: 0 }}>
        {Icon ? (
          <Icon style={{ marginRight: 5 }} />
        ) : (
          <SvgSplit width={10} height={10} style={{ marginRight: 5 }} />
        )}
      </Text>
      <Trans>Split Transaction</Trans>
    </View>
  );
}

function defaultRenderSplitTransactionButton(
  props: SplitTransactionButtonProps,
): ReactElement<typeof SplitTransactionButton> {
  return <SplitTransactionButton {...props} />;
}

type CategoryItemProps = {
  item: CategoryAutocompleteItem;
  className?: string;
  style?: CSSProperties;
  highlighted?: boolean;
  embedded?: boolean;
  showBalances?: boolean;
};

function CategoryItem({
  item,
  className,
  style,
  highlighted,
  embedded,
  showBalances,
  ...props
}: CategoryItemProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const narrowStyle = isNarrowWidth
    ? {
        ...styles.mobileMenuItem,
        borderRadius: 0,
        borderTop: `1px solid ${theme.pillBorder}`,
      }
    : {};
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');

  const balanceBinding =
    budgetType === 'envelope'
      ? envelopeBudget.catBalance(item.id)
      : trackingBudget.catBalance(item.id);
  const balance = useSheetValue<
    'envelope-budget' | 'tracking-budget',
    typeof balanceBinding
  >(balanceBinding);

  const isToBudgetItem = item.id === 'to-budget';
  const toBudget = useEnvelopeSheetValue(envelopeBudget.toBudget);

  return (
    <button
      type="button"
      style={style}
      // See comment above.
      className={cx(
        className,
        css({
          backgroundColor: highlighted
            ? theme.menuAutoCompleteBackgroundHover
            : 'transparent',
          color: highlighted
            ? theme.menuAutoCompleteItemTextHover
            : theme.menuAutoCompleteItemText,
          padding: 4,
          paddingLeft: 20,
          borderRadius: embedded ? 4 : 0,
          border: 'none',
          font: 'inherit',
          ...narrowStyle,
        }),
      )}
      data-testid={`${item.name}-category-item`}
      data-highlighted={highlighted || undefined}
      {...props}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextOneLine>
          {item.name}
          {item.hidden || item.group?.hidden ? ' ' + t('(hidden)') : ''}
        </TextOneLine>
        <TextOneLine
          style={{
            display: !showBalances ? 'none' : undefined,
            marginLeft: 5,
            flexShrink: 0,
            ...makeAmountFullStyle((isToBudgetItem ? toBudget : balance) || 0, {
              positiveColor: theme.noticeTextMenu,
              negativeColor: theme.errorTextMenu,
            }),
          }}
        >
          {isToBudgetItem
            ? toBudget != null && (
                <>
                  {' '}
                  <FinancialText>
                    {integerToCurrency(toBudget || 0)}
                  </FinancialText>
                </>
              )
            : balance != null && (
                <>
                  {' '}
                  <FinancialText>
                    {integerToCurrency(balance || 0)}
                  </FinancialText>
                </>
              )}
        </TextOneLine>
      </View>
    </button>
  );
}

function defaultRenderCategoryItem(
  props: ComponentPropsWithoutRef<typeof CategoryItem>,
): ReactElement<typeof CategoryItem> {
  return <CategoryItem {...props} />;
}

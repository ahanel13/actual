import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import type { TransactionEntity } from '@actual-app/core/types/models';

import { useSelectedDispatch, useSelectedItems } from '#hooks/useSelected';

type BulkEditBarProps = {
  onEdit: (name: keyof TransactionEntity, ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
};

const EDIT_ACTIONS: { label: string; field: keyof TransactionEntity }[] = [
  { label: 'Category', field: 'category' },
  { label: 'Payee', field: 'payee' },
  { label: 'Date', field: 'date' },
  { label: 'Notes', field: 'notes' },
];

export function BulkEditBar({ onEdit, onDelete, onDuplicate }: BulkEditBarProps) {
  const { t } = useTranslation();
  const selectedItems = useSelectedItems();
  const dispatchSelected = useSelectedDispatch();
  const ids = useMemo(() => [...selectedItems], [selectedItems]);
  const count = ids.length;

  if (count === 0) return null;

  const btnStyle = (color = theme.pageText): React.CSSProperties => ({
    padding: '5px 11px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    background: 'transparent',
    color,
    transition: 'background 0.1s',
  });

  const divider = (
    <div
      style={{
        width: 1,
        height: 18,
        backgroundColor: theme.tableBorder,
        margin: '0 2px',
        flexShrink: 0,
      }}
    />
  );

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        backgroundColor: theme.cardBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '6px 10px',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: theme.pageText,
          padding: '0 6px',
        }}
      >
        {t('{{count}} selected', { count })}
      </span>

      {divider}

      {EDIT_ACTIONS.map(({ label, field }) => (
        <button
          key={field}
          style={btnStyle()}
          onMouseEnter={e =>
            (e.currentTarget.style.background = theme.tableBackground)
          }
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => onEdit(field, ids)}
        >
          {t(label)}
        </button>
      ))}

      {divider}

      <button
        style={btnStyle()}
        onMouseEnter={e =>
          (e.currentTarget.style.background = theme.tableBackground)
        }
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => onDuplicate(ids)}
      >
        {t('Duplicate')}
      </button>

      <button
        style={btnStyle(theme.errorText)}
        onMouseEnter={e =>
          (e.currentTarget.style.background = theme.tableBackground)
        }
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => onDelete(ids)}
      >
        {t('Delete')}
      </button>

      {divider}

      <button
        aria-label={t('Clear selection')}
        style={{ ...btnStyle(theme.pageTextSubdued), fontSize: 16, padding: '3px 8px' }}
        onMouseEnter={e =>
          (e.currentTarget.style.background = theme.tableBackground)
        }
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        onClick={() => dispatchSelected({ type: 'select-none' })}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

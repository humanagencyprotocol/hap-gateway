import { useState, useRef, type KeyboardEvent, type ClipboardEvent } from 'react';
import type { AgentProfile, AgentBoundsParams, AgentContextParams, AgentFrameParams, ProfileBoundsField, ProfileContextField } from '@hap/core';

interface Props {
  profile: AgentProfile;
  pathId: string;
  onConfirm: (bounds: AgentBoundsParams, context: AgentContextParams) => void;
  readOnly?: boolean;
  initialBounds?: AgentBoundsParams;
  initialContext?: AgentContextParams;
  initialFrame?: AgentFrameParams;
}

type FieldDef = ProfileBoundsField | ProfileContextField;

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanizeFieldName(key: string, field: FieldDef): string {
  if (field.displayName) return field.displayName;
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isTagField(field: FieldDef): boolean {
  return field.type === 'string' && (field.format === 'email' || field.format === 'domain');
}

function validateTag(value: string, format: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (format === 'email') return trimmed.includes('@') && trimmed.indexOf('.', trimmed.indexOf('@')) > -1;
  if (format === 'domain') return trimmed.includes('.') && !trimmed.includes('@');
  return true;
}

// ─── NumberStepper ──────────────────────────────────────────────────────────

function NumberStepper({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const handleDecrement = () => {
    const n = value === '' ? 0 : Number(value);
    if (n > 0) onChange(String(n - 1));
  };

  const handleIncrement = () => {
    const n = value === '' ? 0 : Number(value);
    onChange(String(n + 1));
  };

  return (
    <div className="number-stepper">
      <button
        type="button"
        className="stepper-btn stepper-decrement"
        onClick={handleDecrement}
        disabled={disabled || value === '' || Number(value) <= 0}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        id={id}
        className="stepper-input"
        type="number"
        min={0}
        step={1}
        value={value}
        placeholder={placeholder ?? '0'}
        onChange={e => onChange(e.target.value)}
        onFocus={e => e.target.select()}
        disabled={disabled}
      />
      <button
        type="button"
        className="stepper-btn stepper-increment"
        onClick={handleIncrement}
        disabled={disabled}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

// ─── TagInput ───────────────────────────────────────────────────────────────

function TagInput({
  id,
  value,
  onChange,
  disabled,
  format,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  format: 'email' | 'domain';
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  const commitTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!validateTag(trimmed, format)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const updated = tags.includes(trimmed) ? tags : [...tags, trimmed];
    onChange(updated.join(','));
    setInputValue('');
  };

  const removeTag = (index: number) => {
    const updated = tags.filter((_, i) => i !== index);
    onChange(updated.join(','));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (inputValue.trim()) {
        e.preventDefault();
        commitTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',')) {
      e.preventDefault();
      const parts = pasted.split(',').map(s => s.trim()).filter(Boolean);
      const valid = parts.filter(p => validateTag(p, format));
      const merged = [...new Set([...tags, ...valid])];
      onChange(merged.join(','));
      setInputValue('');
      setInvalid(false);
    }
  };

  const defaultPlaceholder = format === 'email'
    ? 'Type email and press Enter...'
    : 'Type domain and press Enter...';

  return (
    <div
      className={`tag-input${invalid ? ' tag-input-invalid' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span className="tag-pill" key={tag}>
          {tag}
          {!disabled && (
            <button
              type="button"
              className="tag-remove"
              onClick={e => { e.stopPropagation(); removeTag(i); }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          ref={inputRef}
          id={id}
          className="tag-input-field"
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setInvalid(false); }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => { if (inputValue.trim()) commitTag(inputValue); }}
          placeholder={tags.length === 0 ? (placeholder ?? defaultPlaceholder) : ''}
        />
      )}
    </div>
  );
}

// ─── FieldRow ───────────────────────────────────────────────────────────────

function FieldRow({
  fieldKey,
  fieldDef,
  value,
  onChange,
  prefix,
  readOnly,
  twoColumn,
}: {
  fieldKey: string;
  fieldDef: FieldDef;
  value: string;
  onChange: (key: string, value: string) => void;
  prefix: string;
  readOnly?: boolean;
  twoColumn?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = humanizeFieldName(fieldKey, fieldDef);
  const fieldId = `${prefix}-field-${fieldKey}`;

  const input = (
    <>
      {'enum' in fieldDef && fieldDef.enum ? (
        <select
          id={fieldId}
          className="form-select"
          value={value}
          onChange={e => onChange(fieldKey, e.target.value)}
          disabled={readOnly}
        >
          <option value="">Select...</option>
          {fieldDef.enum.map((v: string) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      ) : fieldDef.type === 'number' ? (
        <NumberStepper
          id={fieldId}
          value={value}
          onChange={v => onChange(fieldKey, v)}
          disabled={readOnly}
        />
      ) : isTagField(fieldDef) ? (
        <TagInput
          id={fieldId}
          value={value}
          onChange={v => onChange(fieldKey, v)}
          disabled={readOnly}
          format={fieldDef.format as 'email' | 'domain'}
        />
      ) : (
        <input
          id={fieldId}
          className="form-input"
          type="text"
          value={value}
          onChange={e => onChange(fieldKey, e.target.value)}
          disabled={readOnly}
        />
      )}
    </>
  );

  if (twoColumn) {
    return (
      <div className="bounds-field-row" key={`${prefix}-${fieldKey}`}>
        <div className="bounds-field-label">
          <label className="form-label" htmlFor={fieldId}>{label}</label>
          {fieldDef.description && (
            <button
              type="button"
              className="field-info-toggle"
              onClick={() => setExpanded(!expanded)}
              aria-label="Toggle description"
            >
              ?
            </button>
          )}
          {expanded && fieldDef.description && (
            <div className="hint-text field-description">{fieldDef.description}</div>
          )}
        </div>
        <div className="bounds-field-input">{input}</div>
      </div>
    );
  }

  return (
    <div className="form-group" key={`${prefix}-${fieldKey}`}>
      <div className="bounds-field-label-inline">
        <label className="form-label" htmlFor={fieldId}>{label}</label>
        {fieldDef.description && (
          <button
            type="button"
            className="field-info-toggle"
            onClick={() => setExpanded(!expanded)}
            aria-label="Toggle description"
          >
            ?
          </button>
        )}
      </div>
      {expanded && fieldDef.description && (
        <div className="hint-text field-description">{fieldDef.description}</div>
      )}
      {input}
    </div>
  );
}

// ─── BoundsEditor ───────────────────────────────────────────────────────────

export function BoundsEditor({ profile, pathId, onConfirm, readOnly, initialBounds, initialContext, initialFrame }: Props) {
  const boundsSchema = profile.boundsSchema ?? profile.frameSchema;
  const contextSchema = profile.contextSchema;

  const boundsFields = boundsSchema
    ? Object.entries(boundsSchema.fields).filter(([key]) => key !== 'profile' && key !== 'path')
    : [];

  const contextFields = contextSchema && contextSchema.keyOrder.length > 0
    ? Object.entries(contextSchema.fields)
    : [];

  const seedBounds = initialBounds ?? initialFrame ?? {};
  const seedContext = initialContext ?? {};

  const initialBoundsValues: Record<string, string> = {};
  for (const [key] of boundsFields) {
    initialBoundsValues[key] = seedBounds[key] !== undefined ? String(seedBounds[key]) : '';
  }

  const initialContextValues: Record<string, string> = {};
  for (const [key] of contextFields) {
    initialContextValues[key] = seedContext[key] !== undefined ? String(seedContext[key]) : '';
  }

  const [boundsValues, setBoundsValues] = useState<Record<string, string>>(initialBoundsValues);
  const [contextValues, setContextValues] = useState<Record<string, string>>(initialContextValues);

  const handleBoundsChange = (key: string, value: string) => {
    setBoundsValues(prev => ({ ...prev, [key]: value }));
  };

  const handleContextChange = (key: string, value: string) => {
    setContextValues(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    const bounds: AgentBoundsParams = {
      profile: profile.id,
      path: pathId,
    };

    for (const [key, fieldDef] of boundsFields) {
      if (fieldDef.type === 'number') {
        bounds[key] = boundsValues[key] === '' ? 0 : Number(boundsValues[key]);
      } else {
        bounds[key] = boundsValues[key];
      }
    }

    const context: AgentContextParams = {};

    for (const [key, fieldDef] of contextFields) {
      if (fieldDef.type === 'number') {
        context[key] = contextValues[key] === '' ? 0 : Number(contextValues[key]);
      } else {
        context[key] = contextValues[key];
      }
    }

    onConfirm(bounds, context);
  };

  return (
    <div>
      {boundsFields.length > 0 && (
        <div className="bounds-section">
          <div className="bounds-section-header">
            <span className="bounds-section-icon">&#x1F512;</span>
            <div>
              <div className="bounds-section-title">Limits</div>
              <div className="bounds-section-subtitle">Enforced by the Service Provider</div>
            </div>
          </div>
          <div className="bounds-fields-grid">
            {boundsFields.map(([key, fieldDef]) => (
              <FieldRow
                key={`bounds-${key}`}
                fieldKey={key}
                fieldDef={fieldDef}
                value={boundsValues[key]}
                onChange={handleBoundsChange}
                prefix="bounds"
                readOnly={readOnly}
                twoColumn
              />
            ))}
          </div>
        </div>
      )}

      {contextFields.length > 0 && (
        <div className="context-section">
          <div className="bounds-section-header">
            <span className="bounds-section-icon">&#x1F6E1;</span>
            <div>
              <div className="bounds-section-title">Allowed scope</div>
              <div className="bounds-section-subtitle">Encrypted on your device, never sent to the SP</div>
            </div>
          </div>
          {contextFields.map(([key, fieldDef]) => (
            <FieldRow
              key={`context-${key}`}
              fieldKey={key}
              fieldDef={fieldDef}
              value={contextValues[key]}
              onChange={handleContextChange}
              prefix="context"
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      <button className="btn btn-primary" onClick={handleConfirm} style={{ marginTop: '0.5rem' }}>
        {readOnly ? 'Next: Gates' : 'Next: Problem Statement'}
      </button>
    </div>
  );
}

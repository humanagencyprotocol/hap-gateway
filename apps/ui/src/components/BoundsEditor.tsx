import { useState } from 'react';
import type { AgentProfile, AgentFrameParams } from '@hap/core';

interface Props {
  profile: AgentProfile;
  pathId: string;
  onConfirm: (frame: AgentFrameParams) => void;
  readOnly?: boolean;
  initialFrame?: AgentFrameParams;
}

export function BoundsEditor({ profile, pathId, onConfirm, readOnly, initialFrame }: Props) {
  const constrainedFields = Object.entries(profile.frameSchema.fields)
    .filter(([key]) => key !== 'profile' && key !== 'path');

  const initial: Record<string, string> = {};
  for (const [key, fieldDef] of constrainedFields) {
    if (initialFrame && initialFrame[key] !== undefined) {
      initial[key] = String(initialFrame[key]);
    } else {
      initial[key] = fieldDef.type === 'number' ? '0' : '';
    }
  }

  const [values, setValues] = useState<Record<string, string>>(initial);

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    const frame: AgentFrameParams = {
      profile: profile.id,
      path: pathId,
    };

    for (const [key, fieldDef] of constrainedFields) {
      if (fieldDef.type === 'number') {
        frame[key] = Number(values[key]);
      } else {
        frame[key] = values[key];
      }
    }

    onConfirm(frame);
  };

  return (
    <div>
      <h3 className="card-title">
        {readOnly ? 'Review Bounds' : 'Set Bounds'}
      </h3>
      <p className="hint-text">
        Profile: <strong>{profile.id}</strong> &middot; Path: <strong>{pathId}</strong>
      </p>

      {constrainedFields.map(([key, fieldDef]) => (
        <div className="form-group" key={key}>
          <label className="form-label" htmlFor={`field-${key}`}>
            {key}
          </label>
          {fieldDef.description && (
            <div className="hint-text">{fieldDef.description}</div>
          )}
          {fieldDef.constraint && (
            <div className="hint-text">
              Enforceable: {fieldDef.constraint.enforceable.join(', ')}
            </div>
          )}
          <input
            id={`field-${key}`}
            className="form-input"
            type={fieldDef.type === 'number' ? 'number' : 'text'}
            value={values[key]}
            onChange={e => handleChange(key, e.target.value)}
            disabled={readOnly}
          />
        </div>
      ))}

      <button className="btn btn-primary" onClick={handleConfirm}>
        {readOnly ? 'Next: Gates' : 'Next: Problem Statement'}
      </button>
    </div>
  );
}

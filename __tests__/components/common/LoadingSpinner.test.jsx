import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../../../src/components/common/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders without crashing', () => {
    const tree = render(<LoadingSpinner />);
    expect(tree).toBeTruthy();
  });

  it('renders with custom size', () => {
    render(<LoadingSpinner size="small" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('renders with custom color', () => {
    render(<LoadingSpinner color="#ff0000" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

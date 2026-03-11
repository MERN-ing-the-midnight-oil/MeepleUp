import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Button from '../../../src/components/common/Button';

describe('Button', () => {
  it('renders label text', () => {
    render(<Button label="Click me" onPress={() => {}} />);
    expect(screen.getByText('Click me')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button label="Submit" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Submit" onPress={onPress} disabled />);
    const btn = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses title for accessibility when provided', () => {
    render(<Button label="Save" title="Save changes" onPress={() => {}} />);
    expect(screen.getByLabelText('Save changes')).toBeTruthy();
  });

  it('falls back to label for accessibility when title not provided', () => {
    render(<Button label="Save" onPress={() => {}} />);
    expect(screen.getByLabelText('Save')).toBeTruthy();
  });
});

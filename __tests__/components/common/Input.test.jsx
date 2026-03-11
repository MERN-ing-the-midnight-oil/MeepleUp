import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Input from '../../../src/components/common/Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Enter name" value="" onChangeText={() => {}} />);
    expect(screen.getByPlaceholderText('Enter name')).toBeTruthy();
  });

  it('displays value', () => {
    render(<Input value="hello" onChangeText={() => {}} />);
    expect(screen.getByDisplayValue('hello')).toBeTruthy();
  });

  it('calls onChangeText when text changes', () => {
    const onChange = jest.fn();
    render(<Input placeholder="Type here" value="" onChangeText={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Type here'), { target: { value: 'new text' } });
    expect(onChange).toHaveBeenCalledWith('new text');
  });

  it('calls onFocus when focused', () => {
    const onFocus = jest.fn();
    render(<Input placeholder="Focus test" value="" onChangeText={() => {}} onFocus={onFocus} />);
    fireEvent.focus(screen.getByPlaceholderText('Focus test'));
    expect(onFocus).toHaveBeenCalled();
  });

  it('calls onBlur when blurred', () => {
    const onBlur = jest.fn();
    render(<Input placeholder="Blur test" value="" onChangeText={() => {}} onBlur={onBlur} />);
    fireEvent.blur(screen.getByPlaceholderText('Blur test'));
    expect(onBlur).toHaveBeenCalled();
  });

  it('respects maxLength when provided', () => {
    render(<Input placeholder="Max 5" value="" onChangeText={() => {}} maxLength={5} />);
    const input = screen.getByPlaceholderText('Max 5');
    expect(input.maxLength).toBe(5);
  });
});

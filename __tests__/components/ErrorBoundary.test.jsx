import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../../src/components/ErrorBoundary';

const GoodChild = () => <>{'I am good'}</>;
const BadChild = () => {
  throw new Error('Test error');
};

describe('ErrorBoundary', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    console.error.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('I am good')).toBeTruthy();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );
    expect(screen.queryByText('I am good')).toBeNull();
    expect(screen.getByText('Oops! Something went wrong')).toBeTruthy();
  });
});

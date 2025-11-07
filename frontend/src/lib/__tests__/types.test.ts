/**
 * Tests for type definitions and error classes.
 */

import { describe, it, expect } from 'vitest';
import { APTError, ErrorCodes } from '../types';

describe('APTError', () => {
  it('should create error with message and code', () => {
    const error = new APTError('Test error', 'TEST_CODE');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(APTError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toBeNull();
  });

  it('should create error with details', () => {
    const error = new APTError('Test error', 'TEST_CODE', 'Additional details');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toBe('Additional details');
  });

  it('should have correct name', () => {
    const error = new APTError('Test error', 'TEST_CODE');

    expect(error.name).toBe('APTError');
  });
});

describe('ErrorCodes', () => {
  it('should define standard error codes', () => {
    expect(ErrorCodes.PACKAGE_NOT_FOUND).toBe('PACKAGE_NOT_FOUND');
    expect(ErrorCodes.EXEC_ERROR).toBe('EXEC_ERROR');
    expect(ErrorCodes.PARSE_ERROR).toBe('PARSE_ERROR');
    expect(ErrorCodes.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(ErrorCodes.LOCKED).toBe('LOCKED');
    expect(ErrorCodes.LOCK_TIMEOUT).toBe('LOCK_TIMEOUT');
    expect(ErrorCodes.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(ErrorCodes.DISK_FULL).toBe('DISK_FULL');
    expect(ErrorCodes.UNKNOWN).toBe('UNKNOWN');
  });
});

import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../generated/operations';
import { commandGroup, commandName } from '../naming';

describe('commandName', () => {
  it('names every public operation noun:verb, with no collisions', () => {
    const names = OPERATIONS.map(commandName);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(
      [
        'alerts:create',
        'alerts:delete',
        'alerts:get',
        'alerts:list',
        'alerts:mute',
        'alerts:run',
        'alerts:test',
        'alerts:unmute',
        'alerts:update',
        'analytics:breakdown',
        'analytics:series',
        'analytics:share-of-voice',
        'analytics:summary',
        'api-keys:create',
        'api-keys:list',
        'api-keys:revoke',
        'channels:create',
        'channels:delete',
        'channels:deliveries',
        'channels:get',
        'channels:list',
        'channels:rotate-secret',
        'channels:test',
        'channels:update',
        'company:get',
        'company:update',
        'keywords:create',
        'keywords:delete',
        'keywords:get',
        'keywords:list',
        'keywords:update',
        'mentions:export',
        'mentions:get',
        'mentions:search',
        'mentions:update',
        'people:activities',
        'people:delete-activity',
        'people:export',
        'people:get',
        'people:list',
        'people:log-activity',
        'people:merge',
        'people:split',
        'people:update',
        'segments:create',
        'segments:delete',
        'segments:get',
        'segments:list',
        'segments:update',
        'system:health',
      ].sort(),
    );
  });

  it('derives the verb from the path and method, with operationId only for search and revoke', () => {
    expect(commandName({ operationId: 'searchMentions', method: 'get', path: '/v1/mentions' })).toBe('mentions:search');
    expect(commandName({ operationId: 'listMentions', method: 'get', path: '/v1/mentions' })).toBe('mentions:list');
    expect(commandName({ operationId: 'revokeApiKey', method: 'delete', path: '/v1/api-keys/{id}' })).toBe('api-keys:revoke');
    expect(commandName({ operationId: 'deleteThing', method: 'delete', path: '/v1/things/{id}' })).toBe('things:delete');
    expect(commandName({ operationId: 'exportMentionsCsv', method: 'get', path: '/v1/mentions/export.csv' })).toBe('mentions:export');
    expect(commandName({ operationId: 'getHealth', method: 'get', path: '/v1/health' })).toBe('system:health');
    // A sub-collection: the path segment alone would name all three the same.
    expect(commandName({ operationId: 'listPersonActivities', method: 'get', path: '/v1/people/{id}/activities' })).toBe(
      'people:activities',
    );
    expect(commandName({ operationId: 'logPersonActivity', method: 'post', path: '/v1/people/{id}/activities' })).toBe(
      'people:log-activity',
    );
    expect(
      commandName({ operationId: 'deletePersonActivity', method: 'delete', path: '/v1/people/{id}/activities/{activityId}' }),
    ).toBe('people:delete-activity');
    expect(commandGroup('channels:rotate-secret')).toBe('channels');
  });
});

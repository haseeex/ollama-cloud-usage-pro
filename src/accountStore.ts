import * as vscode from 'vscode';
import * as crypto from 'node:crypto';

const ACCOUNTS_KEY = 'ollamaCloud.accounts';
const LEGACY_KEY = 'ollamaCloud.apiKey';

export interface Account {
  id: string;
  label: string;
  key: string;
}

export interface AccountsState {
  accounts: Account[];
  activeId?: string;
}

export interface ActiveAccount {
  id: string;
  label: string;
  key: string;
}

function newId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export class AccountStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async load(): Promise<AccountsState> {
    const raw = await this.secrets.get(ACCOUNTS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AccountsState;
        if (Array.isArray(parsed.accounts)) {
          return parsed;
        }
      } catch {
        // fall through to migration
      }
    }

    // Migrate legacy single key
    const legacy = await this.secrets.get(LEGACY_KEY);
    if (legacy) {
      const account: Account = { id: newId(), label: 'Default', key: legacy };
      const state: AccountsState = { accounts: [account], activeId: account.id };
      await this.save(state);
      await this.secrets.delete(LEGACY_KEY);
      return state;
    }

    return { accounts: [] };
  }

  async save(state: AccountsState): Promise<void> {
    await this.secrets.store(ACCOUNTS_KEY, JSON.stringify(state));
  }

  async add(label: string, key: string): Promise<AccountsState> {
    const state = await this.load();
    const account: Account = { id: newId(), label: label.trim() || 'Account', key: key.trim() };
    state.accounts.push(account);
    state.activeId = account.id;
    await this.save(state);
    return state;
  }

  async remove(id: string): Promise<AccountsState> {
    const state = await this.load();
    state.accounts = state.accounts.filter((a) => a.id !== id);
    if (state.activeId === id) {
      state.activeId = state.accounts[0]?.id;
    }
    await this.save(state);
    return state;
  }

  async setActive(id: string): Promise<AccountsState> {
    const state = await this.load();
    if (state.accounts.some((a) => a.id === id)) {
      state.activeId = id;
      await this.save(state);
    }
    return state;
  }

  async getActive(): Promise<ActiveAccount | undefined> {
    const state = await this.load();
    return state.accounts.find((a) => a.id === state.activeId);
  }
}
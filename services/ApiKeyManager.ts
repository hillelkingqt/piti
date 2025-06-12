
class ApiKeyManager {
  private apiKeys: string[] = [
    'AIzaSyD5YKvEiSeUPy3HhHjKmvkhB-f6kr1mtKo',
    'AIzaSyA4TppVdydykoU7bCPGr-IeyAbhCJZQDBM',
    'AIzaSyCqQDiGTA-wX4Aggm-xxWATqTjO7tvW8W8',
    'AIzaSyA2KjqBCn4oT8s5s6WUB1VOVfVO_eI4rXA',
    'AIzaSyBvAVYQtaN00UYO1T5dhqcs1a49nOuFyMg',
    'AIzaSyC6sjR-2NCamBDnk6d5ZLA5JbF-Mcr24Uk',
    'AIzaSyAAtKEbdQzllGB9Gf72FzaNY-HLGrk8K5Y',
    'AIzaSyDT_kWAnT5FQv0-TPOpI-knC_tTUco5CoA'
  ];
  
  private lastUsedIndex: number = -1;
  
  // Get a random API key from the available keys
  public getRandomApiKey(): string {
    const randomIndex = Math.floor(Math.random() * this.apiKeys.length);
    this.lastUsedIndex = randomIndex;
    return this.apiKeys[randomIndex];
  }
  
  // Get the current API key (last used)
  public getCurrentApiKey(): string {
    if (this.lastUsedIndex === -1) {
      return this.getRandomApiKey();
    }
    return this.apiKeys[this.lastUsedIndex];
  }
  
  // Get the next API key in rotation
  public getNextApiKey(): string {
    this.lastUsedIndex = (this.lastUsedIndex + 1) % this.apiKeys.length;
    return this.apiKeys[this.lastUsedIndex];
  }
  
  // Add a new API key to the collection
  public addApiKey(key: string): void {
    if (!this.apiKeys.includes(key)) {
      this.apiKeys.push(key);
    }
  }
}

// Export a singleton instance
export const apiKeyManager = new ApiKeyManager();

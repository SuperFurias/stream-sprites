// Spatial hashing for efficient collision detection
export class SpatialHash {
  constructor(cellSize, width, height) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets = new Map();
  }
  
  _key(cx, cy) { return cx + ',' + cy; }
  
  insert(obj) {
    const radius = obj.collisionRadius || obj.size / 2;
    const minx = Math.floor((obj.x - radius) / this.cellSize);
    const maxx = Math.floor((obj.x + radius) / this.cellSize);
    const miny = Math.floor((obj.y - radius) / this.cellSize);
    const maxy = Math.floor((obj.y + radius) / this.cellSize);
    for (let i = minx; i <= maxx; i++) {
      for (let j = miny; j <= maxy; j++) {
        const k = this._key(i, j);
        if (!this.buckets.has(k)) this.buckets.set(k, []);
        this.buckets.get(k).push(obj);
      }
    }
  }
  
  query(obj) {
    const results = new Set();
    const radius = obj.collisionRadius || obj.size / 2;
    const minx = Math.floor((obj.x - radius) / this.cellSize);
    const maxx = Math.floor((obj.x + radius) / this.cellSize);
    const miny = Math.floor((obj.y - radius) / this.cellSize);
    const maxy = Math.floor((obj.y + radius) / this.cellSize);
    for (let i = minx; i <= maxx; i++) {
      for (let j = miny; j <= maxy; j++) {
        const k = this._key(i, j);
        const arr = this.buckets.get(k);
        if (arr) arr.forEach(o => results.add(o));
      }
    }
    return Array.from(results);
  }
  
  clear() { this.buckets.clear(); }
  
  reinitialize(cellSize, width, height) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.buckets.clear();
  }
}

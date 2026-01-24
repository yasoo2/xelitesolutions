# Performance Optimization: The Art of Speed

## 1. Memory Management
- **Stack vs Heap**:
    - **Stack**: Fast allocation/deallocation (LIFO). Primitive types.
    - **Heap**: Slower, manual management (C/C++) or Garbage Collected (Java/JS/Go). Reference types.
- **Cache Locality**: CPU accesses L1/L2/L3 cache much faster than RAM. Accessing arrays sequentially (contiguous memory) is faster than linked lists (random jumps).

## 2. Computational Complexity (Big O)
- **Know your Complexity**: NEVER put `O(n)` search inside a loop -> `O(n^2)` disaster. Use HashMaps for `O(1)` lookups.
- **Sorting**: QuickSort `O(n log n)` average. MergeSort for stability. RadixSort `O(nk)` for integers.

## 3. Database Tuning
- **Indexes**: B-Trees for range queries. Hash indexes for equality.
- **Query Plan analysis**: `EXPLAIN ANALYZE` in SQL. Look for "Seq Scan" on large tables (BAD).
- **N+1 Problem**: Fetching related data in a loop. Use `JOIN` or batch fetching (DataLoaders).

## 4. System Internals
- **Context Switching**: Expensive CPU operation when switching threads/processes. Async I/O (Node.js/Go) avoids this by using non-blocking event loops.
- **Connection Pooling**: Reusing TCP connections (Keep-Alive) avoids the 3-way handshake overhead for every request.

# Data Science & Analytics: Turning Data into Wisdom

## 1. The Python Data Stack
- **Pandas**: The Swiss Army knife. Use `vectorization` (apply operations to whole arrays) instead of loops.
- **NumPy**: The foundation. Broadcasting rules allow math on arrays of different shapes. Slicing is zero-copy (views).
- **Scikit-learn**: Pipelines are crucial (`Pipeline([('scaler', StandardScaler()), ('svc', SVC())])`) to prevent data leakage during cross-validation.

## 2. Big Data Engineering
- **Spark (PySpark)**:
    - **RDDs vs DataFrames**: Always use DataFrames/Datasets (Catalyst Optimizer).
    - **Lazy Evaluation**: Transformations are only computed when an Action (count, collect) is called.
    - **Partitioning**: Key to performance. Avoid "Data Skew" where one executor does all the work.
- **Warehousing**:
    - **Columnar Storage**: Parquet/ORC files are optimized for read-heavy analytical queries (OLAP).
    - **dbt (Data Build Tool)**: SQL-first transformation. Analytics Engineering standard.

## 3. Visualization & Storytelling
- **Matplotlib/Seaborn**: Static, publication-quality.
- **Plotly/Dash**: Interactive web-based dashboards.
- **Streamlit**: Rapid prototyping for ML apps. Just python scripts, no HTML/CSS needed.

## 4. MLOps
- **MLflow**: Track experiments, metrics, and model versions.
- **Feature Store**: Consistency between training (batch) and serving (real-time) features.

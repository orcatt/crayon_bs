import pandas as pd
import efinance as ef
import sys
import json
import numpy as np

def fetch_and_calculate_relevance(stock_code, index_code, start_date, end_date):
    try:
        # 获取股票和指数数据
        stock_df = ef.stock.get_quote_history(stock_code, beg=start_date, end=end_date)
        index_df = ef.stock.get_quote_history(index_code, beg=start_date, end=end_date)
        
        if stock_df.empty or index_df.empty:
            return json.dumps({"error": "获取的数据为空"})
        
        # 确保数据按日期排序
        stock_df['日期'] = pd.to_datetime(stock_df['日期'])
        index_df['日期'] = pd.to_datetime(index_df['日期'])
        
        # 将两个数据框按日期对齐
        merged_df = pd.merge(stock_df, index_df, on='日期', suffixes=('_stock', '_index'))
        
        # 计算日收益率
        merged_df['stock_return'] = merged_df['收盘_stock'].pct_change()
        merged_df['index_return'] = merged_df['收盘_index'].pct_change()
        
        # 计算 Alpha（超额收益）
        merged_df['alpha'] = merged_df['stock_return'] - merged_df['index_return']
        
        # 计算相关性（使用30天滚动窗口）
        merged_df['correlation'] = merged_df['stock_return'].rolling(window=30).corr(merged_df['index_return'])
        
        # 计算 RSI（14天周期）
        def calculate_rsi(data, periods=14):
            delta = data.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=periods).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=periods).mean()
            rs = gain / loss
            return 100 - (100 / (1 + rs))

        # 计算 ETF 和大盘的 RSI
        merged_df['rsi_stock'] = calculate_rsi(merged_df['收盘_stock'])
        merged_df['rsi_index'] = calculate_rsi(merged_df['收盘_index'])

        # 准备结果数据
        result_df = pd.DataFrame({
            '日期': merged_df['日期'],
            '股票收盘': merged_df['收盘_stock'],
            '指数收盘': merged_df['收盘_index'],
            'Alpha': merged_df['alpha'].round(4),
            '相关性': merged_df['correlation'].round(4),
            'RSI_ETF': merged_df['rsi_stock'].round(2),
            'RSI_大盘': merged_df['rsi_index'].round(2)
        })
        
        # 去除 NaN 数据
        result_df = result_df.dropna()
        result_df['日期'] = result_df['日期'].dt.strftime('%Y-%m-%d')
        
        # 创建结果字典
        result = {
            "code": stock_code,
            "index": index_code,
            "start_date": start_date,
            "end_date": end_date,
            "list": json.loads(result_df.to_json(orient='records', force_ascii=False))
        }
        
        return json.dumps(result, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": f"计算过程出错: {str(e)}"})

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("请提供股票代码、指数代码、开始日期和结束日期")
        sys.exit(1)

    stock_code = sys.argv[1]   # 股票代码
    index_code = sys.argv[2]   # 指数代码
    start_date = sys.argv[3]   # 开始时间
    end_date = sys.argv[4]     # 结束时间

    result_json = fetch_and_calculate_relevance(stock_code, index_code, start_date, end_date)
    print(result_json)

import pandas as pd
import efinance as ef
import sys
import json

def fetch_and_calculate_indicators(stock_code, start_date, end_date):
    # 获取股票数据
    try:
        stock_df = ef.stock.get_quote_history(stock_code, beg=start_date, end=end_date)
    except Exception as e:
        return json.dumps({"error": f"获取数据失败: {str(e)}"})
    
    # 检查数据是否成功获取
    if stock_df.empty:
        return json.dumps({"error": "获取的股票数据为空"})

    # 确保数据按日期排序
    stock_df['日期'] = pd.to_datetime(stock_df['日期'])
    stock_df = stock_df.sort_values('日期')

    # 计算 MA5, MA10, MA20
    ma5 = stock_df['收盘'].rolling(window=5).mean()
    ma10 = stock_df['收盘'].rolling(window=10).mean()
    ma20 = stock_df['收盘'].rolling(window=20).mean()

    # 计算 ATR (Average True Range)
    hl = stock_df['最高'] - stock_df['最低']
    h_pc = abs(stock_df['最高'] - stock_df['收盘'].shift(1))
    l_pc = abs(stock_df['最低'] - stock_df['收盘'].shift(1))
    tr = pd.DataFrame({'TR': hl, 'H-PC': h_pc, 'L-PC': l_pc}).max(axis=1)
    atr = tr.rolling(window=14).mean()  # 使用14天窗口计算 ATR
    
    # 计算 STD (标准差)
    std = stock_df['收盘'].rolling(window=20).std()  # 使用20天窗口计算 STD
    
    # 创建新的 DataFrame 来存放结果
    result_df = pd.DataFrame({
        '日期': stock_df['日期'],
        'MA5': ma5,
        'MA10': ma10,
        'MA20': ma20,
        'ATR': atr,
        'STD': std
    })
    # 去除 NaN 数据
    result_df = result_df.dropna()
    result_df['日期'] = result_df['日期'].dt.strftime('%Y-%m-%d')
    
    # 创建包含 list 字段的结果字典
    result = {
        "code": stock_code,
        "start_date": start_date,
        "end_date": end_date,
        "list": json.loads(result_df.to_json(orient='records', force_ascii=False))
    }
    
    # 转换为 JSON 格式并返回
    return json.dumps(result, ensure_ascii=False)

if __name__ == "__main__":
    # 获取命令行参数
    if len(sys.argv) < 4:
        print("请提供股票代码、开始日期和结束日期")
        sys.exit(1)

    stock_code = sys.argv[1]  # 股票代码
    start_date = sys.argv[2]  # 开始时间
    end_date = sys.argv[3]    # 结束时间

    # 获取股票数据并计算指标
    result_json = fetch_and_calculate_indicators(stock_code, start_date, end_date)
    
    # 输出结果
    print(result_json)
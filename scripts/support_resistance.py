import sys
import json
import efinance as ef
import pandas as pd
import numpy as np

def calculate_fibonacci_pivots(high, low, close):
    """计算斐波那契枢轴点"""
    # 计算基准枢轴点 P
    pivot = (high + low + close) / 3
    
    # 计算价格范围
    range_hl = high - low
    
    # 斐波那契支撑位计算
    s1 = pivot - (range_hl * 0.382)  # 第一支撑位 (38.2%)
    s2 = pivot - (range_hl * 0.618)  # 第二支撑位 (61.8%)
    s3 = pivot - (range_hl * 1.000)  # 第三支撑位 (100%)
    s4 = pivot - (range_hl * 1.618)  # 第四支撑位 (161.8%)
    s5 = pivot - (range_hl * 2.618)  # 第五支撑位 (261.8%)
    
    # 斐波那契阻力位计算
    r1 = pivot + (range_hl * 0.382)  # 第一阻力位 (38.2%)
    r2 = pivot + (range_hl * 0.618)  # 第二阻力位 (61.8%)
    r3 = pivot + (range_hl * 1.000)  # 第三阻力位 (100%)
    r4 = pivot + (range_hl * 1.618)  # 第四阻力位 (161.8%)
    r5 = pivot + (range_hl * 2.618)  # 第五阻力位 (261.8%)
    
    # 计算当前价格到最近支撑位和阻力位的距离
    supports = [s1, s2, s3, s4, s5]
    resistances = [r1, r2, r3, r4, r5]
    
    # 找到最近的支撑位和阻力位
    closest_support = max([s for s in supports if s < close], default=min(supports))
    closest_resistance = min([r for r in resistances if r > close], default=max(resistances))
    
    # 计算距离（百分比）
    distance_to_support = round(abs(close - closest_support) / close * 100, 2)
    distance_to_resistance = round(abs(closest_resistance - close) / close * 100, 2)
    
    return {
        'pivot': round(pivot, 3),
        'supports': {
            's1': round(s1, 3),
            's2': round(s2, 3),
            's3': round(s3, 3),
            's4': round(s4, 3),
            's5': round(s5, 3)
        },
        'resistances': {
            'r1': round(r1, 3),
            'r2': round(r2, 3),
            'r3': round(r3, 3),
            'r4': round(r4, 3),
            'r5': round(r5, 3)
        },
        'distance_to_support': distance_to_support,
        'distance_to_resistance': distance_to_resistance
    }

def fetch_stock_data(stock_code, start_date, end_date):
    # 获取股票数据
    stock_df = ef.stock.get_quote_history(stock_code, beg=start_date, end=end_date)
    
    if stock_df.empty:
        raise Exception("未获取到股票数据")
    
    # 对每一天的数据计算斐波那契枢轴点
    result_list = []
    for _, row in stock_df.iterrows():
        fib_levels = calculate_fibonacci_pivots(
            row['最高'],
            row['最低'],
            row['收盘']
        )
        
        # 构建每日结果数据
        daily_result = {
            'date': row['日期'],
            'close': row['收盘'],
            'high': row['最高'],
            'low': row['最低'],
            **fib_levels  # 展开斐波那契枢轴点数据
        }
        result_list.append(daily_result)
    
    return json.dumps(result_list, ensure_ascii=False)

if __name__ == "__main__":
    # 获取命令行参数
    stock_code = sys.argv[1]  # 股票代码
    start_date = sys.argv[2]  # 开始时间
    end_date = sys.argv[3]    # 结束时间
    
    try:
        # 获取股票数据并计算斐波那契枢轴点
        result_json = fetch_stock_data(stock_code, start_date, end_date)
        
        # 将数据封装成字典
        result = {
            "code": stock_code,
            "start_date": start_date,
            "end_date": end_date,
            "list": json.loads(result_json)
        }
        
        # 输出结果
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        error_result = {
            "code": stock_code,
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))
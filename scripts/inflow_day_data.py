import sys
import json
import efinance as ef
import pandas as pd
import numpy as np

def fetch_stock_data(stock_code, start_date, end_date):
    # 获取股票历史单子流入数据
    stock_df = ef.stock.get_history_bill(stock_code)
    
    # 将日期列转换为 datetime 格式
    stock_df['日期'] = pd.to_datetime(stock_df['日期'], format='%Y-%m-%d')
    
    # 转换输入的日期字符串为 datetime
    start_date = pd.to_datetime(start_date, format='%Y%m%d')
    end_date = pd.to_datetime(end_date, format='%Y%m%d')
    
    # 筛选日期范围内的数据
    mask = (stock_df['日期'] >= start_date) & (stock_df['日期'] <= end_date)
    filtered_df = stock_df.loc[mask].copy()
    
    # 按日期升序排序并重置索引
    filtered_df = filtered_df.sort_values(by='日期', ascending=True).reset_index(drop=True)
    
    # 计算总净流入
    filtered_df['总净流入'] = (filtered_df['主力净流入'] + filtered_df['小单净流入'] + 
                          filtered_df['中单净流入'] + filtered_df['大单净流入'] + 
                          filtered_df['超大单净流入'])
    
    # 计算各类型流入占总流入的实际比例
    total_abs_flow = filtered_df[['主力净流入', '小单净流入', '中单净流入', 
                                 '大单净流入', '超大单净流入']].abs().sum(axis=1)
    
    # 重新计算占比，确保总和为1
    filtered_df['主力净流入占比'] = (filtered_df['主力净流入'] / total_abs_flow * 100).round(2)
    filtered_df['小单流入净占比'] = (filtered_df['小单净流入'] / total_abs_flow * 100).round(2)
    filtered_df['中单流入净占比'] = (filtered_df['中单净流入'] / total_abs_flow * 100).round(2)
    filtered_df['大单流入净占比'] = (filtered_df['大单净流入'] / total_abs_flow * 100).round(2)
    filtered_df['超大单流入净占比'] = (filtered_df['超大单净流入'] / total_abs_flow * 100).round(2)
    
    # 将日期转换为指定格式的字符串
    filtered_df['日期'] = filtered_df['日期'].dt.strftime('%Y-%m-%d')
    
    # 转换为 JSON 格式返回
    return filtered_df.to_json(orient='records', force_ascii=False)

if __name__ == "__main__":
    # 获取命令行参数
    stock_code = sys.argv[1]      # 股票代码
    start_date = sys.argv[2]      # 开始日期
    end_date = sys.argv[3]        # 结束日期
    
    # 获取股票数据
    stock_data_json = fetch_stock_data(stock_code, start_date, end_date)
    
    # 将数据封装成字典，并转换为 JSON 格式
    result = {
        "code": stock_code,
        "start_date": start_date,
        "end_date": end_date,
        "list": json.loads(stock_data_json)
    }
    
    # 输出结果
    print(json.dumps(result, ensure_ascii=False))
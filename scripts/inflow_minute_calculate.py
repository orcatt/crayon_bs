import sys
import json
import efinance as ef
import pandas as pd
import numpy as np

def fetch_stock_data(stock_code):
    # 获取股票当日单子流入数据（分钟级）
    stock_df = ef.stock.get_today_bill(stock_code)
    
    # 转换为 DataFrame
    stock_df['时间'] = pd.to_datetime(stock_df['时间'])
    
    # 特殊处理 15:00 的数据，将其归类到 14 点
    stock_df['小时'] = stock_df['时间'].apply(lambda x: 14 if x.hour == 15 else x.hour)
    
    # 按时间升序排序
    stock_df = stock_df.sort_values(by='时间')

    # 计算每小时的最大超大单净流入和最大主力净流入
    hourly_data = stock_df.groupby('小时').agg({
        '超大单净流入': ['max', 'min', 'mean'],  # 每小时超大单净流入的最大值、最小值和平均值
        '主力净流入': ['max', 'min', 'mean'],    # 每小时主力净流入的最大值、最小值和平均值
    }).reset_index()

    # 重命名列名使其更易读
    hourly_data.columns = ['小时', 
                          '超大单最大净流入', '超大单最小净流入', '超大单平均净流入',
                          '主力最大净流入', '主力最小净流入', '主力平均净流入']

    # 计算每小时的资金流入波动性（使用10分钟窗口计算资金流入的标准差）
    stock_df['超大单波动性'] = stock_df['超大单净流入'].rolling(window=10).std()
    stock_df['主力波动性'] = stock_df['主力净流入'].rolling(window=10).std()
    
    hourly_volatility = stock_df.groupby('小时').agg({
        '超大单波动性': 'mean',
        '主力波动性': 'mean'
    }).reset_index()

    # 合并结果
    final_hourly_data = pd.merge(hourly_data, hourly_volatility, on='小时', how='left')

    # 对结果进行排序
    final_hourly_data = final_hourly_data.sort_values('小时')

    # 对所有数值列进行四舍五入，保留2位小数
    numeric_columns = final_hourly_data.select_dtypes(include=[np.number]).columns
    for col in numeric_columns:
        if col != '小时':  # 排除'小时'列
            final_hourly_data[col] = final_hourly_data[col].round(2)

    return final_hourly_data

def main(stock_code):
    try:
        # 获取股票数据并计算每小时的资金流入和波动性
        result_df = fetch_stock_data(stock_code)
        
        # 将结果转换为字典形式
        result = {
            "code": stock_code,
            "list": json.loads(result_df.to_json(orient='records', force_ascii=False))
        }

        # 输出计算结果
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error_result = {
            "code": stock_code,
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))

if __name__ == "__main__":
    # 获取命令行参数
    stock_code = sys.argv[1]  # 股票代码
    
    # 执行主函数
    main(stock_code)
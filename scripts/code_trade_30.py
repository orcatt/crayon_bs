import sys
import json
import efinance as ef

def fetch_stock_data(stock_code, start_date, end_date):
    # 获取股票数据
    stock_df = ef.stock.get_quote_history(stock_code, beg=start_date, end=end_date)
    
    # 转换为 JSON 格式返回
    return stock_df.to_json(orient='records', force_ascii=False)

if __name__ == "__main__":
    # 获取命令行参数
    stock_code = sys.argv[1]  # 股票代码
    start_date = sys.argv[2]  # 开始时间
    end_date = sys.argv[3]    # 结束时间
    
    # 获取股票数据
    stock_data_json = fetch_stock_data(stock_code, start_date, end_date)
    
    # 将数据封装成字典，并转换为 JSON 格式
    result = {
        "code": stock_code,
        "start_date": start_date,
        "end_date": end_date,
        "list": json.loads(stock_data_json)  # 解析 JSON 数据
    }
    
    # 输出结果，返回给 Node.js
    print(json.dumps(result, ensure_ascii=False))
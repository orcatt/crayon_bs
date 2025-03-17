import sys
import json
import efinance as ef

def fetch_stock_data(stock_code):
    # 获取股票当日单子流入数据（分钟级）
    stock_df = ef.stock.get_today_bill(stock_code)
    
    # 转换为 JSON 格式返回
    return stock_df.to_json(orient='records', force_ascii=False)

if __name__ == "__main__":
    # 获取命令行参数
    stock_code = sys.argv[1]      # 股票代码
    
    # 获取股票数据
    stock_data_json = fetch_stock_data(stock_code)
    
    # 将数据封装成字典，并转换为 JSON 格式
    result = {
        "code": stock_code,
        "list": json.loads(stock_data_json)
    }
    
    # 输出结果
    print(json.dumps(result, ensure_ascii=False))

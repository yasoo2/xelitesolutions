import re

def process_file(path):
    with open(path, 'r') as f:
        content = f.read()

    # 1. Remove import
    content = re.sub(r"import\s+\{\s*store\s*\}\s*from\s+['\"]../mock/store['\"];\n?", "", content)

    # 2. Remove const useMock definition (anywhere)
    content = re.sub(r"const\s+useMock\s+=\s+process\.env\.MOCK_DB\s+===\s+'1'\s+\|\|\s+mongoose\.connection\.readyState\s+!==\s+1;\n?", "", content)

    # 3. Handle if (useMock) { ... } else { ... }
    # We need a parser that respects braces.
    
    # Helper to find matching brace
    def find_matching_brace(text, start_index):
        count = 0
        for i in range(start_index, len(text)):
            if text[i] == '{':
                count += 1
            elif text[i] == '}':
                count -= 1
                if count == 0:
                    return i
        return -1

    # Loop until no more useMock
    while True:
        match = re.search(r"if\s*\(\s*useMock\s*\)\s*\{", content)
        if not match:
            break
        
        start_if = match.start()
        start_brace = match.end() - 1
        end_if_block = find_matching_brace(content, start_brace)
        
        if end_if_block == -1:
            print("Error: Could not find matching brace for if(useMock)")
            break

        # Check for else
        trailing = content[end_if_block+1:].lstrip()
        
        if trailing.startswith("else"):
            # It has an else block
            # Find the else brace
            else_keyword_index = content.find("else", end_if_block)
            
            # Check if it is "else {" or "else if" (unlikely for useMock but possible)
            # Assuming "else {"
            open_brace_search = content.find("{", else_keyword_index)
            if open_brace_search != -1 and open_brace_search < else_keyword_index + 10:
                start_else_brace = open_brace_search
                end_else_block = find_matching_brace(content, start_else_brace)
                
                # We want to replace the whole if...else with the content of else
                else_content = content[start_else_brace+1 : end_else_block]
                
                # If the content starts with newline, strip it? Maybe not strictly necessary but looks better
                # else_content = else_content.strip('\n')

                # Replace
                # Everything from start_if to end_else_block+1
                before = content[:start_if]
                after = content[end_else_block+1:]
                content = before + else_content + after
            else:
                 # else without brace? or else if? 
                 # Just remove the if block? No, risky.
                 print("Found 'else' but not '{' immediately after. Skipping this occurrence manually if needed.")
                 break
        else:
            # No else block. Just remove the if block.
            before = content[:start_if]
            after = content[end_if_block+1:]
            content = before + after

    with open(path, 'w') as f:
        f.write(content)

process_file('api/src/routes/run.ts')

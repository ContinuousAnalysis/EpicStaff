import argparse
from typing import List, Optional

def parse_pr_args() -> Optional[List[int]]:
    parser = argparse.ArgumentParser(description='Run agent on specific PRs')
    parser.add_argument('pr_numbers', nargs='*', type=int, 
                       help='PR numbers to process (optional)')
    
    args = parser.parse_args()
    return args.pr_numbers if args.pr_numbers else None

def parse_release_args() -> tuple[Optional[List[int]], Optional[str]]:
    parser = argparse.ArgumentParser(description='Generate release notes')
    parser.add_argument('pr_numbers', nargs='*', type=int,
                       help='PR numbers to include (optional)')
    parser.add_argument('-t', '--type', 
                       choices=['major', 'minor', 'patch'],
                       help='Release type (major/minor/patch). Auto-detected if not specified')
    
    args = parser.parse_args()
    pr_numbers = args.pr_numbers if args.pr_numbers else None
    release_type = args.type
    
    return pr_numbers, release_type
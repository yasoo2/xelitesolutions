#!/bin/bash
# Script to verify that all updates are synced to main branch
# هذا السكريبت للتحقق من أن جميع التحديثات مدفوعة على الفرع الرئيسي

set -e

echo "=================================="
echo "Main Branch Sync Verification"
echo "التحقق من مزامنة الفرع الرئيسي"
echo "=================================="
echo ""

# Fetch latest from remote
echo "📥 Fetching latest from remote..."
git fetch --all --quiet 2>/dev/null || true

# Get commit hashes - use ls-remote to get actual remote refs
MAIN_COMMIT=$(git ls-remote origin refs/heads/main | cut -f1)
ANALYZE_COMMIT=$(git ls-remote origin refs/heads/copilot/analyze-infinityx-ci-cd | cut -f1)

echo "📍 Branch commits:"
echo "   main:    $MAIN_COMMIT"
echo "   analyze: $ANALYZE_COMMIT"
echo ""

# Check if they're different
if [ "$MAIN_COMMIT" = "$ANALYZE_COMMIT" ]; then
    echo "✅ RESULT: Branches point to the same commit!"
    echo "✅ النتيجة: الفرعان يشيران إلى نفس الـ commit!"
    exit 0
fi

# Check for differences in files
echo "🔍 Checking for file differences..."
DIFF_COUNT=$(git diff $MAIN_COMMIT $ANALYZE_COMMIT --name-only 2>/dev/null | wc -l)

if [ "$DIFF_COUNT" -eq 0 ]; then
    echo ""
    echo "✅ RESULT: All files are identical!"
    echo "✅ النتيجة: جميع الملفات متطابقة!"
    echo ""
    echo "📝 Note: main is a merge commit that includes all changes"
    echo "📝 ملاحظة: main هو merge commit يتضمن جميع التغييرات"
    echo ""
    echo "🔗 Git structure:"
    git log --graph --oneline --decorate $MAIN_COMMIT $ANALYZE_COMMIT 2>/dev/null | head -20
else
    echo ""
    echo "⚠️  RESULT: Found $DIFF_COUNT different files"
    echo "⚠️  النتيجة: وجدنا $DIFF_COUNT ملف مختلف"
    echo ""
    echo "Different files:"
    git diff $MAIN_COMMIT $ANALYZE_COMMIT --name-only
fi

echo ""
echo "=================================="

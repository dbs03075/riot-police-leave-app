// ========================================
// 연가 변경 이력 관리 (관리자용)
// ========================================

async function loadHistory(dateStr) {
  const contentDiv = document.getElementById("historyContent");

  if (!dateStr) {
    contentDiv.innerHTML = '<div class="empty-state"><p>날짜를 선택하여 이력을 조회하세요.</p></div>';
    return;
  }

  contentDiv.innerHTML = '<div style="text-align:center; padding: 20px;">이력을 불러오는 중입니다...</div>';

  try {
    const historyDocId = `${selectedUnit}_${dateStr}`;
    const doc = await db.collection("leave_history").doc(historyDocId).get();

    if (!doc.exists) {
      contentDiv.innerHTML = `<div class="empty-state"><p>[${selectedUnit}] ${dateStr} 일자의 변경 이력이 없습니다.</p></div>`;
      return;
    }

    const data = doc.data();
    const logs = data.logs || [];

    if (logs.length === 0) {
      contentDiv.innerHTML = `<div class="empty-state"><p>[${selectedUnit}] ${dateStr} 일자의 변경 이력이 없습니다.</p></div>`;
      return;
    }

    // 최신 변경 순으로 정렬 (역순)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let html = '<div class="history-list" style="display: flex; flex-direction: column; gap: 15px;">';

    logs.forEach((log, index) => {
      const timeObj = new Date(log.timestamp);
      const timeStr = timeObj.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      let changesHtml = '<ul style="margin: 5px 0 0 20px; padding: 0; list-style-type: disc;">';
      if (log.changes && log.changes.length > 0) {
        log.changes.forEach((change) => {
          const actionText = change.type === "delete" ? "삭제" : "설정";
          const color = change.type === "delete" ? "#E74C3C" : "#00A86B";
          changesHtml += `<li style="margin-bottom: 3px;"><strong>${change.empName}</strong>: ${change.reason} <span style="color: ${color}; font-size: 0.9em;">(${actionText})</span></li>`;
        });
      } else {
        changesHtml += "<li>내역 없음</li>";
      }
      changesHtml += "</ul>";

      html += `
                <div style="padding: 15px; border: 1px solid #e0e0e0; border-radius: 6px; background-color: #fafafa;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
                        <span style="font-weight: bold; color: #333;">작업자: ${log.by}</span>
                        <span style="color: #666; font-size: 0.9em;">${timeStr}</span>
                    </div>
                    <div style="font-size: 0.95em; color: #444;">
                        <span style="display: inline-block; background: #e3f2fd; color: #1565c0; padding: 2px 8px; border-radius: 4px; font-weight: bold; margin-bottom: 5px;">대상일: ${log.leaveDate}</span>
                        <div>${changesHtml}</div>
                    </div>
                </div>
            `;
    });

    html += "</div>";
    contentDiv.innerHTML = html;
  } catch (error) {
    console.error("변경 이력 조회 실패:", error);
    contentDiv.innerHTML = `<div class="empty-state" style="color: #E74C3C;"><p>이력을 불러오는 중 오류가 발생했습니다.</p></div>`;
  }
}

// 탭 스위치 시 자동 처리는 js/modal.js의 switchTab 함수에서 직접 담당합니다.

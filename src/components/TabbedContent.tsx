import { Box, Tabs, Tab, Typography } from '@mui/material';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

export type TabData = {
	id: string;
	name: string;
	content: ReactNode;
}

type TabbedContentProps = {
  tabs: TabData[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder: (dragIndex: number, hoverIndex: number) => void;
}

export function TabbedContent({ tabs, activeTab, onTabChange, onTabClose, onTabReorder }: TabbedContentProps) {
  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex !== dropIndex) {
      onTabReorder(dragIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (tabs.length === 0) {
    return (
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1e1e2e'
      }}>
        <Typography variant="h6" sx={{ color: '#cdd6f4' }}>
          No tabs open
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e2e' }}>
      <Box sx={{ borderBottom: '1px solid rgba(205, 214, 244, 0.1)', backgroundColor: '#1e1e2e' }}>
        <Tabs 
          value={activeTab} 
          onChange={(_, newValue) => onTabChange(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 'auto',
            '& .MuiTab-root': {
              minHeight: 28,
              fontSize: '12px',
              textTransform: 'none',
              minWidth: 100,
              color: '#cdd6f4',
              py: 0.5,
              px: 1,
              '&.Mui-selected': {
                color: '#cdd6f4',
              }
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#cdd6f4',
            },
            '& .MuiTabs-flexContainer': {
              minHeight: 28,
            }
          }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.id}
              value={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              sx={{
                cursor: 'move',
                opacity: draggedIndex === index ? 0.5 : 1,
                borderLeft: dragOverIndex === index && draggedIndex !== index ? '2px solid #89b4fa' : 'none',
                borderRight: dragOverIndex === index && draggedIndex !== index ? '2px solid #89b4fa' : 'none',
                backgroundColor: dragOverIndex === index && draggedIndex !== index ? 'rgba(137, 180, 250, 0.1)' : 'transparent',
                transition: 'all 0.2s ease'
              }}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <Typography variant="body2" sx={{ flex: 1, textAlign: 'left' }}>
                    {tab.name}
                  </Typography>
                  <Box
                    component="span"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.id);
                    }}
                    sx={{ 
                      ml: 0.5, 
                      p: 0.125,
                      minWidth: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'rgba(205, 214, 244, 0.1)' }
                    }}
                  >
                    <X size={10} />
                  </Box>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>
      
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {activeTabData && activeTabData.content}
      </Box>
    </Box>
  );
}

